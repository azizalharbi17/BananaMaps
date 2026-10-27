// Robinhood Chain (Arbitrum Orbit, chain id 4663) data access straight from a
// JSON-RPC node — the only holder/history source for this chain since its
// Blockscout API went behind a Cloudflare challenge (2026-09). Everything is
// derived from ERC-20 Transfer logs: a full replay from genesis yields exact
// balances (→ top holders), per-address counterparty counts (→ graph edges) and
// the supply; the worker then follows the same log stream incrementally.
//
// Endpoints: ROBINHOOD_RPC_URLS is an ordered list — our own node first, the
// public RPC last. Each call goes to the first endpoint that is healthy and not
// lagging; an endpoint that errors is skipped for a cooldown and the next one
// takes over, so a node outage degrades to the public RPC without intervention.
//
// Public RPC facts (measured 2026-10-27, Nitro v3.12.x behind a rate limiter):
//   - eth_getLogs with an address filter: ≤10,000,000-block range, ≤10,000 logs per
//     response ("logs matched by query exceeds limit of 10000" is an error, not a
//     truncation); OR-lists in a topic position drop the range cap to 100k blocks.
//   - ~4-5 requests/s burst → HTTP 429 (no Retry-After); JSON-RPC batches count per
//     element (80 elements → 429, 40 fine). Non-browser User-Agents get 403.
//   - Pruned full node: no historical state, but receipts/logs from block 1.
import { recordProviderCall, registerProviderHost, providerOf, Provider } from './providerMeter';
import { UpstreamError, HeavyTokenError } from './errors';
import { expandHistories, CpCounts } from './histories';
import type { RawHolder, RawTransfer } from './graphCore';

export const ROBINHOOD_PUBLIC_RPC = 'https://rpc.mainnet.chain.robinhood.com';
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const num = (k: string, d: number) => {
  const v = process.env[k];
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : d;
};

// ---- knobs (env; the app and the worker each read their own environment) ----
const PUBLIC_MIN_INTERVAL_MS = num('RH_RPC_MIN_INTERVAL_MS', 500);   // public endpoint pacing (see header)
const NODE_MIN_INTERVAL_MS = num('RH_NODE_MIN_INTERVAL_MS', 0);      // our own node: unpaced by default
const MAX_LAG_BLOCKS = num('RH_RPC_MAX_LAG_BLOCKS', 100);             // ~16 s of blocks; beyond → next endpoint
const BATCH = Math.max(1, num('RH_RPC_BATCH', 25));                   // JSON-RPC batch size (public 429s at ~80)
const PUBLIC_MAX_RANGE = 10_000_000;                                  // hard cap on the public RPC (address filter)
const NODE_MAX_RANGE = num('RH_NODE_LOGS_MAX_RANGE', 10_000_000);
// The public RPC is load-balanced: eth_blockNumber may come from a node a few
// blocks ahead of the one that answers the next eth_getLogs, which silently clamps
// toBlock to its own head. Scanning to head − margin keeps the stream gap-free.
// With several endpoints configured the margin also covers the lag tolerance of
// the endpoint pick, since consecutive calls may hit different endpoints.
const HEAD_MARGIN_BLOCKS = num('RH_HEAD_MARGIN_BLOCKS', 20);
const TARGET_LOGS = num('RH_LOGS_TARGET', 6000);                      // logs per getLogs call to aim for (cap 10k)
const TIMEOUT_MS = num('RH_RPC_TIMEOUT_MS', 30_000);
const HEALTH_TTL_MS = 60_000;
const FAIL_COOLDOWN_MS = 120_000;      // with a fallback available: skip a failing endpoint this long
const SOLO_COOLDOWN_MS = 30_000;       // only endpoint: just a short breather before retrying
const LAG_COOLDOWN_MS = 60_000;
const CP_HARD = num('RH_REPLAY_CP_HARD', 2000);                       // per-address counterparty map bound during replay
const CP_SOFT = num('RH_REPLAY_CP_SOFT', 1000);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const hex = (n: number) => '0x' + n.toString(16);
export const topicToAddr = (t: string) => ('0x' + t.slice(26)).toLowerCase();
export const addrToTopic = (a: string) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

/** BigInt-safe raw → formatted conversion (double precision is plenty for graph balances). */
export function formatUnits(raw: string | bigint, decimals: number): number {
  try {
    const b = typeof raw === 'bigint' ? raw : BigInt(raw);
    const neg = b < BigInt(0);
    const abs = neg ? -b : b;
    if (decimals <= 0) return Number(b);
    const s = abs.toString().padStart(decimals + 1, '0');
    const n = Number(`${s.slice(0, -decimals)}.${s.slice(-decimals)}`);
    return neg ? -n : n;
  } catch {
    return Number(raw) / Math.pow(10, decimals) || 0;
  }
}

// ---------- endpoints ----------

interface Endpoint {
  url: string;
  host: string;
  isPublic: boolean;
  provider: Provider;
  minIntervalMs: number;
  maxRange: number;
  nextAt: number;          // pacing: earliest start time of the next request
  failedUntil: number;
  failReason: string;
  head: number;
  headAt: number;
}

interface ModState {
  endpoints: Endpoint[] | null;
  gate: (() => void) | null;
  lastFallbackLogAt: number;
  stats: { requests: number; rateLimited: number; limitErrors: number };
}
const mod: ModState = ((globalThis as any).__robinhoodRpc ||= { endpoints: null, gate: null, lastFallbackLogAt: 0, stats: { requests: 0, rateLimited: 0, limitErrors: 0 } });

/** Process-wide counters: HTTP requests sent, 429 retries, "narrow the query" errors. */
export const rpcStats = () => ({ ...mod.stats });

function parseUrls(): string[] {
  const raw = env('ROBINHOOD_RPC_URLS');
  const urls = raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const u of urls) if (!out.includes(u)) out.push(u);
  if (!out.length) out.push(ROBINHOOD_PUBLIC_RPC);
  // The public RPC stays as the last-resort fallback unless explicitly disabled.
  if (!out.includes(ROBINHOOD_PUBLIC_RPC) && env('ROBINHOOD_RPC_PUBLIC_FALLBACK', '1') !== '0') out.push(ROBINHOOD_PUBLIC_RPC);
  return out;
}

function endpoints(): Endpoint[] {
  if (mod.endpoints) return mod.endpoints;
  mod.endpoints = parseUrls().map(url => {
    let host = url;
    try { host = new URL(url).hostname; } catch { /* keep raw */ }
    const isPublic = url === ROBINHOOD_PUBLIC_RPC || host.endsWith('chain.robinhood.com');
    if (!isPublic) registerProviderHost(host, 'robinhood-node');
    return {
      url, host, isPublic,
      provider: isPublic ? 'robinhood-rpc' : providerOf(url),
      minIntervalMs: isPublic ? PUBLIC_MIN_INTERVAL_MS : NODE_MIN_INTERVAL_MS,
      maxRange: isPublic ? PUBLIC_MAX_RANGE : Math.max(1_000, NODE_MAX_RANGE),
      nextAt: 0, failedUntil: 0, failReason: '', head: 0, headAt: 0,
    };
  });
  return mod.endpoints;
}

/** Configured endpoint URLs in priority order (own node first, public last). */
export const robinhoodEndpointUrls = () => endpoints().map(e => e.url);

/** Provider name the next call will be attributed to (budgeting/circuit breaker). */
export function currentRobinhoodProvider(): Provider {
  const now = Date.now();
  return (endpoints().find(e => e.failedUntil <= now) || endpoints()[endpoints().length - 1]).provider;
}

/**
 * Pre-call gate installed by the worker: throws (UpstreamError) when the day's
 * provider budget is exhausted so a long replay stops instead of overspending.
 */
export function setRobinhoodCallGate(fn: (() => void) | null) { mod.gate = fn; }

function markFailed(ep: Endpoint, reason: string, ms = endpoints().length > 1 ? FAIL_COOLDOWN_MS : SOLO_COOLDOWN_MS) {
  const was = ep.failedUntil > Date.now();
  ep.failedUntil = Date.now() + ms;
  ep.failReason = reason;
  if (!was) console.warn(`[robinhood-rpc] endpoint ${ep.host} unavailable for ${Math.round(ms / 1000)}s: ${reason.slice(0, 160)}`);
}

async function pace(ep: Endpoint) {
  if (!ep.minIntervalMs) return;
  const now = Date.now();
  const wait = ep.nextAt - now;
  ep.nextAt = Math.max(now, ep.nextAt) + ep.minIntervalMs;
  if (wait > 0) await sleep(wait);
}

/** One HTTP POST to one endpoint with 429/5xx/network retries. JSON-RPC errors come back in the body. */
async function post(ep: Endpoint, body: unknown, retries = 4): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    await pace(ep);
    try {
      recordProviderCall(ep.url);
      mod.stats.requests++;
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        if (res.status === 429) mod.stats.rateLimited++;
        if (attempt >= retries) throw new UpstreamError(`HTTP ${res.status} ${ep.host}`);
        const ra = Number(res.headers.get('retry-after'));
        await sleep(res.status === 429 ? (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500 * (attempt + 1)) : 800 * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new UpstreamError(`HTTP ${res.status} ${ep.host}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new UpstreamError(`HTTP ${res.status} ${ep.host} ${txt.slice(0, 120)}`);
      }
      const json: any = await res.json();
      // Some gateways answer 200 with a JSON-RPC 429 body.
      if (!Array.isArray(body) && json?.error?.code === 429) {
        mod.stats.rateLimited++;
        if (attempt >= retries) throw new UpstreamError(`rate limited ${ep.host}`);
        await sleep(1500 * (attempt + 1));
        continue;
      }
      return json;
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      if (attempt >= retries) throw new UpstreamError(`${ep.host}: ${e instanceof Error ? e.message : String(e)}`);
      await sleep(500 * (attempt + 1));
    }
  }
}

async function headOf(ep: Endpoint): Promise<number> {
  const r = await post(ep, { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }, 1);
  const n = typeof r?.result === 'string' ? parseInt(r.result, 16) : NaN;
  if (!Number.isFinite(n)) throw new UpstreamError(`${ep.host}: bad eth_blockNumber response`);
  return n;
}

/**
 * The endpoint to use now: first healthy one that isn't lagging behind the others.
 * A single configured endpoint is always returned — there is nothing to fail over
 * to, and a cooldown would only turn one throttled call into fail-fast errors for
 * every other token dispatched meanwhile (post() already backs off per request).
 */
async function pick(): Promise<Endpoint> {
  const eps = endpoints();
  const live = () => eps.filter(e => e.failedUntil <= Date.now());
  if (eps.length === 1) return eps[0];
  // Refresh every live endpoint's head in the same pass so the lag comparison
  // never mixes a fresh sample with one up to HEALTH_TTL_MS old.
  if (live().some(e => Date.now() - e.headAt >= HEALTH_TTL_MS)) {
    for (const e of live()) {
      try { e.head = await headOf(e); e.headAt = Date.now(); }
      catch (err) { markFailed(e, err instanceof Error ? err.message : String(err)); }
    }
  }
  const ok = live();
  if (!ok.length) throw new UpstreamError(`robinhood rpc: every endpoint unavailable (${eps.map(e => `${e.host}: ${e.failReason}`).join('; ')})`);
  const maxHead = Math.max(...ok.map(e => e.head));
  for (const e of ok) {
    if (e.head >= maxHead - MAX_LAG_BLOCKS) {
      if (e !== eps[0] && Date.now() - mod.lastFallbackLogAt > 60_000) {
        mod.lastFallbackLogAt = Date.now();
        console.warn(`[robinhood-rpc] using fallback endpoint ${e.host} (${eps[0].host}: ${eps[0].failReason || 'lagging'})`);
      }
      return e;
    }
    markFailed(e, `lagging ${maxHead - e.head} blocks behind`, LAG_COOLDOWN_MS);
  }
  throw new UpstreamError('robinhood rpc: no endpoint within the lag tolerance');
}

/** Endpoint-specific range cap for log scans (the next pick, without network). */
function currentMaxRange(): number {
  const now = Date.now();
  return (endpoints().find(e => e.failedUntil <= now) || endpoints()[0]).maxRange;
}

export class RpcError extends Error {
  constructor(public readonly code: number, message: string, public readonly method: string) { super(`${method}: ${message}`); }
}

/** "Narrow the query" class of errors: too many logs / too wide a range / response too big. */
export const isLimitError = (e: unknown) => e instanceof RpcError
  && /exceed|limit|too many|too large|query spans|block range|returned more than|response size|timeout|timed out/i.test(e.message);

/** JSON-RPC call with endpoint selection and one failover retry. */
export async function rpcCall(method: string, params: unknown[]): Promise<any> {
  mod.gate?.(); // budget/circuit decision — outside the endpoint failure handling
  for (let attempt = 0; ; attempt++) {
    const ep = await pick();
    let res: any;
    try {
      res = await post(ep, { jsonrpc: '2.0', id: 1, method, params });
    } catch (e) {
      if (endpoints().length > 1) {
        markFailed(ep, e instanceof Error ? e.message : String(e));
        if (attempt === 0) continue;
      }
      throw e;
    }
    if (res?.error) throw new RpcError(Number(res.error.code) || 0, String(res.error.message || JSON.stringify(res.error)), method);
    return res?.result;
  }
}

export interface BatchItem { method: string; params: unknown[] }
export interface BatchResult { result?: any; error?: string }
export interface BatchOptions {
  chunkSize?: number;
  /** Record a failed chunk as per-element errors and keep going instead of throwing (best-effort lookups). */
  partial?: boolean;
}

/** Batched JSON-RPC (chunked to the endpoint-safe size). Per-element errors are returned, not thrown. */
export async function rpcBatch(items: BatchItem[], opts: BatchOptions = {}): Promise<BatchResult[]> {
  const chunkSize = opts.chunkSize ?? BATCH;
  const out: BatchResult[] = new Array(items.length);
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const body = chunk.map((it, j) => ({ jsonrpc: '2.0', id: j, method: it.method, params: it.params }));
    let res: any;
    try {
      mod.gate?.();
      for (let attempt = 0; ; attempt++) {
        const ep = await pick();
        try { res = await post(ep, body); break; }
        catch (e) {
          if (endpoints().length > 1) {
            markFailed(ep, e instanceof Error ? e.message : String(e));
            if (attempt === 0) continue;
          }
          throw e;
        }
      }
      if (!Array.isArray(res)) {
        // A top-level error object means the endpoint rejected the whole batch
        // (rate limit, size, outage) — nothing can be said about the elements.
        throw new UpstreamError(`batch rejected: ${String(res?.error?.message || JSON.stringify(res)).slice(0, 160)}`);
      }
    } catch (e) {
      if (!opts.partial) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      for (let j = 0; j < chunk.length; j++) out[i + j] = { error: msg };
      continue;
    }
    for (let j = 0; j < chunk.length; j++) out[i + j] = { error: 'missing' };
    for (const item of res) {
      const j = Number(item?.id);
      if (!Number.isInteger(j) || j < 0 || j >= chunk.length) continue;
      out[i + j] = item?.error ? { error: String(item.error.message || JSON.stringify(item.error)) } : { result: item?.result };
    }
  }
  return out;
}

export async function getHead(): Promise<number> {
  const n = parseInt(await rpcCall('eth_blockNumber', []), 16);
  if (!Number.isFinite(n)) throw new UpstreamError('bad eth_blockNumber response');
  return n;
}

/** The newest block a scan may safely end at right now (see HEAD_MARGIN_BLOCKS). */
export async function safeHead(): Promise<number> {
  const margin = endpoints().length > 1 ? Math.max(HEAD_MARGIN_BLOCKS, MAX_LAG_BLOCKS) : HEAD_MARGIN_BLOCKS;
  return Math.max(1, (await getHead()) - margin);
}

// ---------- ABI helpers ----------

function decodeUint(hexStr: unknown): bigint | null {
  if (typeof hexStr !== 'string' || !/^0x[0-9a-fA-F]*$/.test(hexStr) || hexStr.length < 3) return null;
  try { return BigInt(hexStr.slice(0, 66)); } catch { return null; }
}

function decodeString(hexStr: unknown): string {
  if (typeof hexStr !== 'string' || hexStr.length < 3) return '';
  const h = hexStr.slice(2);
  const bytes = (s: string) => {
    const arr = new Uint8Array(Math.floor(s.length / 2));
    for (let i = 0; i < arr.length; i++) arr[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16) || 0;
    return arr;
  };
  let raw: Uint8Array;
  if (h.length === 64) {
    raw = bytes(h); // bytes32-style (old tokens)
  } else {
    const offset = parseInt(h.slice(0, 64), 16) * 2;
    const len = parseInt(h.slice(offset, offset + 64), 16);
    if (!Number.isFinite(offset) || !Number.isFinite(len) || len > 1024) return '';
    raw = bytes(h.slice(offset + 64, offset + 64 + len * 2));
  }
  let s = '';
  try { s = new TextDecoder('utf-8', { fatal: false }).decode(raw); } catch { return ''; }
  return s.replace(/\u0000+$/g, '').replace(/[\u0000-\u001f]/g, '').trim();
}

export interface TokenInfo {
  exists: boolean;
  decimals: number;
  totalSupply: bigint | null;
  name: string;
  symbol: string;
}

/** decimals / totalSupply / name / symbol in one batch. `exists` = the address answers like an ERC-20. */
export async function tokenInfo(token: string): Promise<TokenInfo> {
  const call = (data: string) => ({ method: 'eth_call', params: [{ to: token, data }, 'latest'] });
  const [dec, sup, name, sym] = await rpcBatch([call('0x313ce567'), call('0x18160ddd'), call('0x06fdde03'), call('0x95d89b41')]);
  // Every element erroring is an endpoint problem, not an answer about the token
  // (a non-contract returns '0x' without error).
  if ([dec, sup, name, sym].every(r => r.error !== undefined)) throw new UpstreamError(`tokenInfo: ${dec.error}`);
  const d = decodeUint(dec.result);
  const decimals = d !== null && d <= BigInt(36) ? Number(d) : 18;
  const totalSupply = decodeUint(sup.result);
  const exists = (d !== null) || (totalSupply !== null);
  return { exists, decimals, totalSupply, name: decodeString(name.result), symbol: decodeString(sym.result).replace(/^\$/, '') };
}

// ---------- log scanning ----------

export interface RawLog { address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string }

export interface ScanOptions {
  /** Abort with HeavyTokenError once this many getLogs calls were spent (on-demand builds). */
  maxCalls?: number;
  /** Newest blocks first (holder histories want the most recent transfers). */
  reverse?: boolean;
  /** Starting range guess (defaults to the endpoint's cap; dense tokens shrink it on the first error). */
  initialRange?: number;
  /** Return early (e.g. enough logs collected). Checked before every call. */
  stopWhen?: () => boolean;
  /** Calls already spent by the caller, counted toward maxCalls. */
  callsSoFar?: number;
}

export interface ScanResult { calls: number; firstBlock: number | null; lastBlock: number | null; logs: number }

/**
 * eth_getLogs over [from, to] in adaptively sized chunks: the range grows while
 * responses are sparse and shrinks toward TARGET_LOGS per call; a "too many
 * results / too wide" error quarters the range and retries the same window.
 */
export async function scanLogs(
  filter: Record<string, unknown>, from: number, to: number,
  onChunk: (logs: RawLog[], from: number, to: number) => void,
  opts: ScanOptions = {},
): Promise<ScanResult> {
  let maxRange = currentMaxRange();
  let range = Math.min(maxRange, opts.initialRange ?? maxRange);
  let calls = opts.callsSoFar ?? 0;
  let firstBlock: number | null = null, lastBlock: number | null = null, total = 0;
  const spend = () => {
    if (opts.maxCalls !== undefined && calls >= opts.maxCalls) throw new HeavyTokenError(`log scan exceeded ${opts.maxCalls} calls`, calls);
    calls++;
  };
  let cur = opts.reverse ? to : from;
  while (opts.reverse ? cur >= from : cur <= to) {
    if (opts.stopWhen?.()) break;
    const lo = opts.reverse ? Math.max(from, cur - range + 1) : cur;
    const hi = opts.reverse ? cur : Math.min(to, cur + range - 1);
    spend();
    let logs: RawLog[];
    try {
      logs = (await rpcCall('eth_getLogs', [{ ...filter, fromBlock: hex(lo), toBlock: hex(hi) }])) || [];
    } catch (e) {
      if (isLimitError(e) && range > 1) {
        // Quarter the window and retry it; a batch mint can put >10k logs into a
        // handful of blocks, so keep shrinking down to a single block.
        mod.stats.limitErrors++;
        maxRange = currentMaxRange();
        range = Math.max(1, Math.min(maxRange, Math.floor(range / 4)));
        continue;
      }
      throw e;
    }
    const n = logs.length;
    total += n;
    if (n) {
      const b0 = parseInt(logs[0].blockNumber, 16), b1 = parseInt(logs[n - 1].blockNumber, 16);
      firstBlock = firstBlock === null ? Math.min(b0, b1) : Math.min(firstBlock, b0, b1);
      lastBlock = lastBlock === null ? Math.max(b0, b1) : Math.max(lastBlock, b0, b1);
    }
    onChunk(logs, lo, hi);
    cur = opts.reverse ? lo - 1 : hi + 1;
    // Grow while sparse, shrink toward the target while dense — never re-inflate a
    // window that limit errors already took below the usual floor.
    if (n < TARGET_LOGS / 4) range = Math.min(maxRange, range * 2);
    else if (n > TARGET_LOGS) range = Math.max(1, Math.floor(range * TARGET_LOGS / n));
  }
  return { calls: calls - (opts.callsSoFar ?? 0), firstBlock, lastBlock, logs: total };
}

export interface DecodedTransfer { from: string; to: string; raw: bigint; block: number; id: string }

/** ERC-20 Transfer(address indexed, address indexed, uint256) only — 4-topic (ERC-721) events are ignored. */
export function decodeTransfer(l: RawLog): DecodedTransfer | null {
  if (!l?.topics || l.topics.length !== 3) return null;
  let raw: bigint;
  try { raw = l.data && l.data !== '0x' ? BigInt(l.data.length > 66 ? l.data.slice(0, 66) : l.data) : BigInt(0); } catch { return null; }
  return {
    from: topicToAddr(l.topics[1]),
    to: topicToAddr(l.topics[2]),
    raw,
    block: parseInt(l.blockNumber, 16),
    id: `${l.transactionHash}:${parseInt(l.logIndex, 16)}`,
  };
}

// ---------- full replay ----------

export interface Replay {
  token: string;
  /** Last block included in the replay (the delta stream continues at head + 1). */
  head: number;
  firstBlock: number | null;
  calls: number;
  logCount: number;
  /** Address → raw balance (only addresses that ever received tokens; may include zero/negative). */
  balances: Map<string, bigint>;
  /** Sum of positive balances (= minted − burned for well-behaved tokens). */
  supply: bigint;
  holderCount: number;
  minted: bigint;
  burned: bigint;
  /** Addresses whose replayed balance went negative (fee/rebase quirks) — excluded from holders. */
  anomalies: number;
  /** Counterparty counts of one address (bounded per address, see CP_HARD/CP_SOFT); undefined = never transacted. */
  cpOf: (addr: string) => CpCounts | undefined;
  /** Apply one more Transfer (catch-up after the main scan); call summarizeReplay() afterwards. */
  apply: (d: DecodedTransfer) => void;
  /** Distinct addresses seen in the replay. */
  addressCount: number;
}

/** An empty replay (token with no Transfer logs). */
export const emptyReplay = (token: string, head = 0): Replay => ({
  token: token.toLowerCase(), head, firstBlock: null, calls: 0, logCount: 0, balances: new Map(), supply: BigInt(0), holderCount: 0,
  minted: BigInt(0), burned: BigInt(0), anomalies: 0, cpOf: () => undefined, apply: () => undefined, addressCount: 0,
});

/** Recompute supply / holderCount / anomalies from the balances (after apply()). */
export function summarizeReplay(r: Replay) {
  const ZERO = BigInt(0);
  let supply = ZERO, holderCount = 0, anomalies = 0;
  for (const v of r.balances.values()) {
    if (v > ZERO) { supply += v; holderCount++; }
    else if (v < ZERO) anomalies++;
  }
  r.supply = supply; r.holderCount = holderCount; r.anomalies = anomalies;
}

// Counterparty counts are kept per interned address id as Map<id, packed> with
// packed = out * CP_SHIFT + in — small-integer keys and values keep V8's Map
// compact (a 700k-transfer token stays well under 100 MB).
const CP_SHIFT = 2 ** 26;
const CP_MAX = CP_SHIFT - 1;

export interface ReplayOptions {
  fromBlock?: number;
  toBlock?: number;
  maxCalls?: number;
  onProgress?: (p: { calls: number; logs: number; block: number; head: number }) => void;
}

/** Replay every Transfer of `token` in [fromBlock, toBlock] into balances + counterparty counts. */
export async function replayToken(token: string, opts: ReplayOptions = {}): Promise<Replay> {
  const t = token.toLowerCase();
  const ZERO = BigInt(0);
  let calls = 0;
  let head = opts.toBlock;
  if (head === undefined) { head = await safeHead(); calls++; }
  const balances = new Map<string, bigint>();
  const ids = new Map<string, number>();
  const addrs: string[] = [];
  const cp: Array<Map<number, number> | undefined> = [];
  let minted = ZERO, burned = ZERO, logCount = 0;

  const idOf = (a: string) => {
    let id = ids.get(a);
    if (id === undefined) { id = addrs.length; ids.set(a, id); addrs.push(a); }
    return id;
  };
  const total = (packed: number) => Math.floor(packed / CP_SHIFT) + (packed % CP_SHIFT);
  const bumpCp = (a: number, b: number, dir: 0 | 1) => {
    let m = cp[a];
    if (!m) { m = new Map(); cp[a] = m; }
    const e = m.get(b);
    if (e !== undefined) {
      const out = Math.floor(e / CP_SHIFT), inn = e % CP_SHIFT;
      m.set(b, dir === 0 ? Math.min(CP_MAX, out + 1) * CP_SHIFT + inn : out * CP_SHIFT + Math.min(CP_MAX, inn + 1));
      return;
    }
    m.set(b, dir === 0 ? CP_SHIFT : 1);
    if (m.size > CP_HARD) {
      // Keep the most-connected counterparties (same rule as the worker's pruning).
      const kept = [...m.entries()].sort((x, y) => total(y[1]) - total(x[1])).slice(0, CP_SOFT);
      cp[a] = new Map(kept);
    }
  };

  const apply = (d: DecodedTransfer) => {
    logCount++;
    if (d.raw > ZERO) {
      if (d.from === ZERO_ADDR) minted += d.raw; else balances.set(d.from, (balances.get(d.from) ?? ZERO) - d.raw);
      if (d.to === ZERO_ADDR) burned += d.raw; else balances.set(d.to, (balances.get(d.to) ?? ZERO) + d.raw);
    }
    if (d.from !== d.to && d.from !== ZERO_ADDR && d.to !== ZERO_ADDR && d.from !== t && d.to !== t) {
      const fi = idOf(d.from), ti = idOf(d.to);
      bumpCp(fi, ti, 0);
      bumpCp(ti, fi, 1);
    }
  };

  let chunks = 0;
  const scan = await scanLogs({ address: t, topics: [TRANSFER_TOPIC] }, opts.fromBlock ?? 1, head, (logs, _lo, hi) => {
    for (const l of logs) { const d = decodeTransfer(l); if (d) apply(d); }
    chunks++;
    opts.onProgress?.({ calls: calls + chunks, logs: logCount, block: hi, head: head! });
  }, { maxCalls: opts.maxCalls, callsSoFar: calls });
  calls += scan.calls;

  const cpOf = (addr: string): CpCounts | undefined => {
    const id = ids.get(addr.toLowerCase());
    const m = id === undefined ? undefined : cp[id];
    if (!m) return undefined;
    const rec: CpCounts = {};
    for (const [b, packed] of m) rec[addrs[b]] = [Math.floor(packed / CP_SHIFT), packed % CP_SHIFT];
    return rec;
  };
  const replay: Replay = {
    token: t, head, firstBlock: scan.firstBlock, calls, logCount, balances, supply: ZERO, holderCount: 0, minted, burned, anomalies: 0, cpOf,
    apply: d => { apply(d); replay.logCount = logCount; replay.minted = minted; replay.burned = burned; replay.addressCount = addrs.length; },
    addressCount: addrs.length,
  };
  summarizeReplay(replay);
  return replay;
}

/**
 * Bring a replay from its head to the current safe head (the main scan of a large
 * token takes minutes; balances must be exact at the block the cursor starts from).
 */
export async function catchUpReplay(replay: Replay): Promise<number> {
  const r = await fetchDeltas(replay.token, replay.head + 1);
  for (const d of r.deltas) replay.apply(d);
  if (r.head > replay.head) replay.head = r.head;
  replay.calls += r.calls;
  summarizeReplay(replay);
  return r.deltas.length;
}

/** Top-N holders by replayed balance (zero/negative balances excluded). */
export function topHolders(replay: Pick<Replay, 'balances' | 'supply'>, decimals: number, n = 150): RawHolder[] {
  const ZERO = BigInt(0);
  const entries: [string, bigint][] = [];
  for (const [a, v] of replay.balances) if (v > ZERO) entries.push([a, v]);
  entries.sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0));
  return entries.slice(0, n).map(([address, v]) => ({
    address,
    balanceFormatted: formatUnits(v, decimals),
    pct: pctOf(v, replay.supply),
  }));
}

export function pctOf(v: bigint, supply: bigint): number {
  if (supply <= BigInt(0) || v <= BigInt(0)) return 0;
  return Number((v * BigInt(1_000_000)) / supply) / 10_000;
}

/** Counterparty counts for the given holders, as plain objects (the worker's history shape). */
export function cpFor(replay: Pick<Replay, 'cpOf'>, holders: string[]): Map<string, CpCounts> {
  const out = new Map<string, CpCounts>();
  for (const h of holders) out.set(h, replay.cpOf(h) || {});
  return out;
}

/** Transfer lists for buildGraph, expanded from the replay's counterparty counts. */
export function historiesFor(replay: Pick<Replay, 'cpOf'>, holders: string[]): Map<string, RawTransfer[]> {
  return expandHistories(cpFor(replay, holders));
}

/**
 * Authoritative balanceOf for a set of addresses (one batch per 25), evaluated at
 * `blockTag` — pass the block the ledger/replay is exact at so the values and the
 * cursor refer to the same state (reading 'latest' would double-apply the deltas
 * between the two). Missing entries = that call failed (e.g. a node that doesn't
 * have the requested block yet).
 */
export async function balancesOf(token: string, addrs: string[], blockTag: string | number = 'latest'): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  if (!addrs.length) return out;
  const tag = typeof blockTag === 'number' ? hex(blockTag) : blockTag;
  const res = await rpcBatch(addrs.map(a => ({ method: 'eth_call', params: [{ to: token, data: '0x70a08231' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0') }, tag] })), { partial: true });
  res.forEach((r, i) => { const v = decodeUint(r.result); if (v !== null) out.set(addrs[i].toLowerCase(), v); });
  return out;
}

/** Addresses (of the given set) that carry code. Unanswered elements are simply absent. */
export async function contractsAmong(addrs: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!addrs.length) return out;
  const res = await rpcBatch(addrs.map(a => ({ method: 'eth_getCode', params: [a, 'latest'] })), { partial: true });
  res.forEach((r, i) => { if (typeof r.result === 'string' && r.result !== '0x') out.add(addrs[i].toLowerCase()); });
  return out;
}

export interface HistoryOptions { maxLogs?: number; maxCalls?: number }

/**
 * One holder's transfers of `token` (both directions), newest first, scanned
 * backwards from `toBlock` until `maxLogs` are collected or `fromBlock` is
 * reached. Two single-value topic filters: OR-lists would cap the range at 100k
 * blocks on the public RPC.
 */
export async function holderHistory(token: string, holder: string, fromBlock: number, toBlock: number, opts: HistoryOptions = {}): Promise<{ transfers: RawTransfer[]; calls: number }> {
  const maxLogs = opts.maxLogs ?? 5000;
  const t = token.toLowerCase();
  const topic = addrToTopic(holder);
  const found: DecodedTransfer[] = [];
  let calls = 0;
  for (const topics of [[TRANSFER_TOPIC, topic], [TRANSFER_TOPIC, null, topic]]) {
    let n = 0;
    const r = await scanLogs({ address: t, topics }, Math.max(1, fromBlock), toBlock, logs => {
      for (const l of logs) { const d = decodeTransfer(l); if (d) { found.push(d); n++; } }
    }, { reverse: true, stopWhen: () => n >= maxLogs, maxCalls: opts.maxCalls, callsSoFar: calls });
    calls += r.calls;
  }
  found.sort((a, b) => b.block - a.block);
  const seen = new Set<string>();
  const transfers: RawTransfer[] = [];
  for (const d of found) {
    if (seen.has(d.id)) continue; // self-transfers match both filters
    seen.add(d.id);
    if (d.from === ZERO_ADDR || d.to === ZERO_ADDR || d.from === t || d.to === t) continue;
    transfers.push({ from: d.from, to: d.to, id: d.id });
    if (transfers.length >= maxLogs) break;
  }
  return { transfers, calls };
}

export interface DeltaResult { deltas: DecodedTransfer[]; head: number; calls: number }

/** Every Transfer of `token` in [fromBlock, head] in block order — the worker's incremental stream. */
export async function fetchDeltas(token: string, fromBlock: number): Promise<DeltaResult> {
  const head = await safeHead();
  const deltas: DecodedTransfer[] = [];
  let calls = 1;
  if (head >= fromBlock) {
    const r = await scanLogs({ address: token.toLowerCase(), topics: [TRANSFER_TOPIC] }, fromBlock, head, logs => {
      for (const l of logs) { const d = decodeTransfer(l); if (d) deltas.push(d); }
    }, { initialRange: Math.min(currentMaxRange(), 200_000) });
    calls += r.calls;
  }
  return { deltas, head, calls };
}
