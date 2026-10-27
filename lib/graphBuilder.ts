// Server-side only. Fetches holders + transfer histories and assembles a TokenGraph.
// API mechanics (pagination, field names, rate behavior) verified against live endpoints 2026-07-08.
import { TokenGraph } from './graphTypes';
import { buildGraph, normAddr, RawHolder, RawTransfer, AddrLabel, TokenMeta } from './graphCore';
import { getExchangeInfo } from './exchanges';
import { resolveWalletLabels } from './labelResolver';
import { recordProviderCall } from './providerMeter';
import { UpstreamError, NotIndexedError, HeavyTokenError } from './errors';
import { replayToken, emptyReplay, catchUpReplay, topHolders, historiesFor, balancesOf, tokenInfo, pctOf, formatUnits, rpcStats, Replay, ReplayOptions, TokenInfo } from './robinhoodRpc';

const MORALIS_KEY = process.env.MORALIS_API_KEY!;
const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const VYBE_KEY = process.env.VYBE_API_KEY || '';
const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2.2';
const MORALIS_SOL = 'https://solana-gateway.moralis.io';
const HELIUS_TX = 'https://api.helius.xyz/v0';

export const MORALIS_CHAIN: Record<string, string> = { eth: '0x1', bsc: '0x38', base: '0x2105' };
export const CHAIN_LABEL: Record<string, string> = { eth: 'Ethereum', bsc: 'BSC', sol: 'Solana', base: 'Base', robinhood: 'Robinhood Chain' };

// Robinhood Chain (Arbitrum Orbit L2, chain id 4663 / 0x1237) — Moralis doesn't
// index it and its Blockscout API sits behind a Cloudflare challenge, so holders,
// histories and supply are replayed from ERC-20 Transfer logs over JSON-RPC
// (lib/robinhoodRpc.ts; own node first, public RPC as fallback).
export const LOG_CHAINS = new Set(['robinhood']);
export const isLogChain = (chain: string) => LOG_CHAINS.has(chain);
// The Robinhood RPC 403s non-browser User-Agents.
export const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export const TOP_HOLDERS = 150;
const TRANSFER_PAGES_PER_WALLET = 1; // 100 transfers per holder
const CONCURRENCY: Record<string, number> = { sol: 3, evm: 3 };
const BATCH_DELAY_MS: Record<string, number> = { sol: 400, evm: 350 };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const FETCH_TIMEOUT_MS = 15_000;

export { UpstreamError, NotIndexedError, HeavyTokenError };

/**
 * GET/POST JSON with timeout + retry.
 * Returns null for 4xx no-data responses (bad token, nothing there).
 * Throws UpstreamError for persistent 401/403/429/5xx/network failures so callers
 * can distinguish "token not found" from "our data source is down".
 */
export async function fetchJson(url: string, init?: RequestInit, retries = 2): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      recordProviderCall(url);
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= retries) {
          console.error(`[graph] ${res.status} after ${attempt + 1} tries: ${url.slice(0, 120)}`);
          throw new UpstreamError(`HTTP ${res.status}`);
        }
        await sleep(800 * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        console.error(`[graph] auth failure ${res.status}: ${url.slice(0, 120)}`);
        throw new UpstreamError(`HTTP ${res.status}`);
      }
      if (!res.ok) {
        console.error(`[graph] HTTP ${res.status}: ${url.slice(0, 120)}`);
        return null; // 400/404 — treated as "no data for this input"
      }
      return await res.json();
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      if (attempt >= retries) {
        console.error(`[graph] fetch failed: ${url.slice(0, 120)}: ${e}`);
        throw new UpstreamError(String(e));
      }
      await sleep(500 * (attempt + 1));
    }
  }
}

/** Variant for best-effort calls (metadata enrichment): never throws, just returns null. */
export async function tryFetchJson(url: string, init?: RequestInit): Promise<any> {
  try {
    return await fetchJson(url, init, 1);
  } catch {
    return null;
  }
}

export const moralisHeaders = { headers: { 'X-API-Key': MORALIS_KEY } };

/** Run tasks with bounded concurrency + inter-batch delay (rate-limit courtesy). */
async function batched<T, R>(items: T[], size: number, delayMs: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...await Promise.all(batch.map(fn)));
    if (i + size < items.length) await sleep(delayMs);
  }
  return out;
}

// ---------- EVM (Moralis) ----------

export interface HolderFetch {
  holders: RawHolder[];
  labels: Map<string, AddrLabel>;
}

const CEX_NAME_RE = /binance|coinbase|kraken|okx|bybit|upbit|kucoin|gate\.?io|huobi|htx|bitget|mexc|crypto\.com|bitfinex|gemini|robinhood|bithumb|korbit|paribu|bitvavo|coinone|bitflyer|coincheck|bitso|btcturk|bitstamp|okcoin|poloniex|wazirx|indodax|exchange/i;

export function classifyMoralisLabel(label: string | null, entity: string | null, isContract: boolean): AddrLabel | null {
  const name = entity || label;
  if (name && CEX_NAME_RE.test(name)) return { label: name, labelType: 'cex' };
  if (name && /uniswap|pancake|sushiswap|1inch|curve|balancer|aerodrome|router|\bdex\b/i.test(name)) return { label: name, labelType: 'dex' };
  // Moralis labels vanity burn wallets "Null: 0xdea...069"
  if (name && /burn|^null[: ]|null address|dead|incinerat/i.test(name)) return { label: name, labelType: 'burn' };
  if (name) return isContract ? { label: name, labelType: 'contract' } : { label: name };
  if (isContract) return { label: 'Contract', labelType: 'contract' };
  return null;
}

export async function fetchHoldersEVM(token: string, chain: string): Promise<HolderFetch> {
  const chainId = MORALIS_CHAIN[chain] || '0x1';
  const holders: RawHolder[] = [];
  const labels = new Map<string, AddrLabel>();
  let cursor = '';
  while (holders.length < TOP_HOLDERS) {
    const url = `${MORALIS_BASE}/erc20/${token}/owners?chain=${chainId}&order=DESC&limit=100${cursor ? `&cursor=${cursor}` : ''}`;
    let data;
    try {
      data = await fetchJson(url, moralisHeaders);
    } catch (e) {
      if (!holders.length) throw e; // first page down = source down; later pages degrade
      break;
    }
    if (!data?.result?.length) break;
    for (const h of data.result) {
      const addr = h.owner_address; // already lowercase
      holders.push({
        address: addr,
        balanceFormatted: Number(h.balance_formatted),
        pct: Number(h.percentage_relative_to_total_supply) || 0,
        usdValue: Number(h.usd_value) || undefined,
      });
      const known = getExchangeInfo(addr, chain);
      const fromApi = classifyMoralisLabel(h.owner_address_label, h.entity, !!h.is_contract);
      if (known) labels.set(addr, { label: known.name, labelType: known.type });
      else if (fromApi) labels.set(addr, fromApi);
    }
    cursor = data.cursor || '';
    if (!cursor) break;
    await sleep(250);
  }
  return { holders: holders.slice(0, TOP_HOLDERS), labels };
}

export interface TransferFetch {
  transfers: Map<string, RawTransfer[]>;
  /** Wallets whose history fetch errored (vs. genuinely having no transfers). */
  failedWallets: number;
}

export async function fetchTransfersEVM(
  token: string, chain: string, holders: RawHolder[], labels: Map<string, AddrLabel>,
): Promise<TransferFetch> {
  const chainId = MORALIS_CHAIN[chain] || '0x1';
  const out = new Map<string, RawTransfer[]>();
  let failedWallets = 0;
  await batched(holders, CONCURRENCY.evm, BATCH_DELAY_MS.evm, async (h) => {
    const transfers: RawTransfer[] = [];
    let cursor = '';
    for (let page = 0; page < TRANSFER_PAGES_PER_WALLET; page++) {
      const url = `${MORALIS_BASE}/${h.address}/erc20/transfers?chain=${chainId}&contract_addresses%5B%5D=${token}&limit=100${cursor ? `&cursor=${cursor}` : ''}`;
      let data;
      try {
        data = await fetchJson(url, moralisHeaders);
      } catch {
        failedWallets++;
        break;
      }
      if (!data?.result?.length) break;
      for (const t of data.result) {
        transfers.push({ from: t.from_address, to: t.to_address, id: `${t.transaction_hash}:${t.log_index}` });
        // Harvest entity labels for counterparties from the transfer rows
        for (const [addr, label, entity] of [
          [t.from_address, t.from_address_label, t.from_address_entity],
          [t.to_address, t.to_address_label, t.to_address_entity],
        ] as [string, string | null, string | null][]) {
          if (!addr || labels.has(addr)) continue;
          const known = getExchangeInfo(addr, chain);
          if (known) { labels.set(addr, { label: known.name, labelType: known.type }); continue; }
          const fromApi = classifyMoralisLabel(label, entity, false);
          if (fromApi) labels.set(addr, fromApi);
        }
      }
      cursor = data.cursor || '';
      if (!cursor) break;
    }
    out.set(h.address, transfers);
  });
  return { transfers: out, failedWallets };
}

function firstFinite(...vals: unknown[]): number {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && v !== null && v !== undefined && v !== '') return n;
  }
  return 0;
}

export async function fetchMetaEVM(token: string, chain: string, holderCount: number): Promise<TokenMeta> {
  const chainId = MORALIS_CHAIN[chain] || '0x1';
  const [price, dex, holderStats] = await Promise.all([
    tryFetchJson(`${MORALIS_BASE}/erc20/${token}/price?chain=${chainId}&include=percent_change`, moralisHeaders),
    tryFetchJson(`https://api.dexscreener.com/latest/dex/tokens/${token}`),
    tryFetchJson(`${MORALIS_BASE}/erc20/${token}/holders?chain=${chainId}`, moralisHeaders),
  ]);
  const pair = bestPair(dex?.pairs, token, chain);
  return {
    name: price?.tokenName || pair?.baseToken?.name || '',
    symbol: price?.tokenSymbol || pair?.baseToken?.symbol || '',
    logo: price?.tokenLogo || pair?.info?.imageUrl || '',
    price: firstFinite(price?.usdPrice, pair?.priceUsd),
    priceChange24h: firstFinite(price?.usdPrice24hrPercentChange, pair?.priceChange?.h24),
    marketCap: firstFinite(pair?.marketCap, pair?.fdv),
    volume24h: sumVolume24h(dex?.pairs, token, chain),
    totalHolders: firstFinite(holderStats?.totalHolders),
    holderCount,
    liquidityUsd: firstFinite(pair?.liquidity?.usd),
  };
}

// ---------- Log-replay chains (Robinhood Chain) ----------

export interface LogSnapshot {
  holders: RawHolder[];
  labels: Map<string, AddrLabel>;
  transfers: Map<string, RawTransfer[]>;
  meta: TokenMeta;
  replay: Replay;
  info: TokenInfo;
  /** Top-set balances confirmed on-chain (balanceOf) — false when that batch failed. */
  verified: boolean;
}

export interface LogSnapshotOptions {
  /** getLogs budget before giving up with HeavyTokenError (on-demand builds). Omit for unlimited (worker). */
  maxCalls?: number;
  topN?: number;
  onProgress?: ReplayOptions['onProgress'];
  /**
   * Expand per-holder transfer lists for buildGraph (default). The worker keeps
   * counterparty counts instead and passes false — on the chain's largest token
   * the expansion is >5M objects (~250 MB) it would never read.
   */
  withTransfers?: boolean;
}

/**
 * getLogs budget of an on-demand (serverless) build. ~80 paced calls ≈ 1 minute
 * and ≈ 400k transfers of history; anything bigger is handed to the worker.
 */
export const ONDEMAND_MAX_LOG_CALLS = Number(process.env.RH_ONDEMAND_MAX_CALLS) > 0 ? Number(process.env.RH_ONDEMAND_MAX_CALLS) : 80;

const emptyMeta = (): TokenMeta => ({ name: '', symbol: '', logo: '', price: 0, priceChange24h: 0 });

function prettyDex(id: string): string {
  return id ? id.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'DEX';
}

/** DexScreener pairs on this chain → pool-contract labels (the hub node of every memecoin graph). */
export function dexPoolLabels(pairs: any[] | undefined, chain: string): Map<string, AddrLabel> {
  const out = new Map<string, AddrLabel>();
  const slug = Object.entries(DEX_CHAIN_TO_OURS).find(([, v]) => v === chain)?.[0];
  for (const p of pairs || []) {
    if (slug && p.chainId !== slug) continue;
    const addr = String(p.pairAddress || '').toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(addr)) out.set(addr, { label: `${prettyDex(String(p.dexId || ''))} Pool`, labelType: 'dex' });
  }
  return out;
}

/**
 * Everything a graph needs for a log-replay chain, from one pass over the token's
 * Transfer logs since genesis: exact balances → top holders, counterparty counts →
 * per-holder histories, supply and holder count, plus ERC-20 metadata (eth_call)
 * and DexScreener market data. Replaces the Blockscout holders/transfers/meta trio.
 */
export async function fetchLogSnapshot(token: string, chain: string, opts: LogSnapshotOptions = {}): Promise<LogSnapshot> {
  const t = token.toLowerCase();
  const topN = opts.topN ?? TOP_HOLDERS;
  const t0 = Date.now();
  const [info, dex] = await Promise.all([
    tokenInfo(t),
    tryFetchJson(`https://api.dexscreener.com/latest/dex/tokens/${t}`),
  ]);
  const empty = (replay: Replay): LogSnapshot => ({ holders: [], labels: new Map(), transfers: new Map(), meta: emptyMeta(), replay, info, verified: false });
  if (!info.exists) {
    // Nothing ERC-20-shaped at this address (or the node can't see it): no holders.
    return empty(emptyReplay(t));
  }
  const stats0 = rpcStats();
  const replay = await replayToken(t, { maxCalls: opts.maxCalls, onProgress: opts.onProgress });
  // The main scan of a large token takes minutes: bring the replay to a fresh safe
  // head so the balances, the verification below and the worker's cursor all refer
  // to the same block.
  const caughtUp = await catchUpReplay(replay);
  const stats1 = rpcStats();
  const rpcNote = `${stats1.rateLimited - stats0.rateLimited} rate-limit retries, ${stats1.limitErrors - stats0.limitErrors} range splits`;
  let holders = topHolders(replay, info.decimals, topN);
  if (!holders.length) return empty(replay);

  // Confirm the top set on-chain AT THE REPLAY HEAD: fee-on-transfer / rebasing
  // tokens move balances without Transfer events, so balanceOf wins over the replay
  // where they differ. Pinning the block keeps the values consistent with the
  // cursor (a 'latest' read would already include deltas the worker applies next).
  let verified = false;
  try {
    const asked = holders.length;
    const onchain = await balancesOf(t, holders.map(h => h.address), replay.head);
    if (onchain.size) {
      let drift = 0;
      for (const h of holders) {
        const v = onchain.get(h.address);
        if (v === undefined) continue;
        if (v !== (replay.balances.get(h.address) ?? BigInt(0))) drift++;
        replay.balances.set(h.address, v); // the ledger seeded from this replay must carry the confirmed values too
        h.balanceFormatted = formatUnits(v, info.decimals);
        h.pct = pctOf(v, replay.supply);
      }
      holders = holders.filter(h => h.balanceFormatted > 0).sort((a, b) => b.balanceFormatted - a.balanceFormatted);
      verified = onchain.size >= asked * 0.8;
      if (drift) console.log(`[graph] ${chain}:${t} balanceOf differs from the replay for ${drift}/${asked} top holders (fee/rebase token?)`);
    } else {
      console.warn(`[graph] ${chain}:${t} balanceOf at block ${replay.head} unavailable; keeping replayed balances`);
    }
  } catch (e) {
    console.error(`[graph] ${chain}:${t} balanceOf verification failed: ${e instanceof Error ? e.message : e}`);
  }

  const labels = new Map<string, AddrLabel>();
  for (const [addr, lb] of dexPoolLabels(dex?.pairs, chain)) labels.set(addr, lb);
  for (const h of holders) {
    const known = getExchangeInfo(h.address, chain);
    if (known) labels.set(h.address, { label: known.name, labelType: known.type });
    else if (h.address === t) labels.set(h.address, { label: 'Token Contract', labelType: 'contract' });
  }
  const transfers = opts.withTransfers === false ? new Map<string, RawTransfer[]>() : historiesFor(replay, holders.map(h => h.address));
  const pair = bestPair(dex?.pairs, t, chain);
  const meta: TokenMeta = {
    name: info.name || pair?.baseToken?.name || '',
    symbol: info.symbol || pair?.baseToken?.symbol || '',
    logo: pair?.info?.imageUrl || '',
    price: firstFinite(pair?.priceUsd),
    priceChange24h: firstFinite(pair?.priceChange?.h24),
    marketCap: firstFinite(pair?.marketCap, pair?.fdv),
    volume24h: sumVolume24h(dex?.pairs, t, chain),
    totalHolders: replay.holderCount || undefined,
    holderCount: holders.length,
    liquidityUsd: firstFinite(pair?.liquidity?.usd),
  };
  console.log(`[graph] ${chain}:${t} replayed ${replay.logCount} transfers in ${replay.calls} calls (first block ${replay.firstBlock ?? '-'}, head ${replay.head}, ${replay.holderCount} holders of ${replay.addressCount} addresses${replay.anomalies ? `, ${replay.anomalies} negative` : ''}${verified ? ', balances verified' : ''}; catch-up ${caughtUp}; ${rpcNote}) (${Date.now() - t0}ms)`);
  return { holders, labels, transfers, meta, replay, info, verified };
}

// The holders/transfers/meta dispatchers below are three views of one snapshot:
// a short-lived memo keeps a fetchHolders → fetchTransfers → fetchTokenMeta
// sequence from replaying the chain three times.
const snapshotMemo: Map<string, { at: number; p: Promise<LogSnapshot> }> =
  ((globalThis as any).__logSnapshotMemo ||= new Map());
const SNAPSHOT_MEMO_MS = 5 * 60_000;
function memoSnapshot(chain: string, address: string): Promise<LogSnapshot> {
  const key = `${chain}:${address.toLowerCase()}`;
  const hit = snapshotMemo.get(key);
  if (hit && Date.now() - hit.at < SNAPSHOT_MEMO_MS) return hit.p;
  const p = fetchLogSnapshot(address, chain, { maxCalls: ONDEMAND_MAX_LOG_CALLS });
  p.catch(() => snapshotMemo.delete(key));
  snapshotMemo.set(key, { at: Date.now(), p });
  if (snapshotMemo.size > 50) for (const [k, v] of snapshotMemo) if (Date.now() - v.at >= SNAPSHOT_MEMO_MS) snapshotMemo.delete(k);
  return p;
}

export async function fetchHoldersLogs(token: string, chain: string): Promise<HolderFetch> {
  const s = await memoSnapshot(chain, token);
  return { holders: s.holders, labels: new Map(s.labels) };
}

export async function fetchTransfersLogs(token: string, chain: string, _holders: RawHolder[], labels: Map<string, AddrLabel>): Promise<TransferFetch> {
  const s = await memoSnapshot(chain, token);
  for (const [a, l] of s.labels) if (!labels.has(a)) labels.set(a, l);
  return { transfers: s.transfers, failedWallets: 0 };
}

export async function fetchMetaLogs(token: string, chain: string, holderCount: number): Promise<TokenMeta> {
  const s = await memoSnapshot(chain, token);
  return { ...s.meta, holderCount };
}

// ---------- Solana (Moralis solana-gateway + Helius Enhanced Transactions) ----------

// Vybe's owner-level labels ("Binance Exchange 1", "Raydium AMM Authority") are a
// bonus label source; classify them the same way Moralis entities are.
function classifyVybeOwnerName(name: string | null | undefined): AddrLabel | null {
  if (!name) return null;
  const short = name.replace(/\s*(hot\s*|cold\s*)?wallet\s*\d*$/i, '').replace(/\s+\d+$/, '').trim() || name;
  if (CEX_NAME_RE.test(name)) return { label: short, labelType: 'cex' };
  if (/raydium|orca|meteora|jupiter|pump\.?fun|pumpswap|amm|pool|vault|liquidity|dex|whirlpool|phoenix|openbook/i.test(name)) return { label: name, labelType: 'dex' };
  if (/burn|incinerat/i.test(name)) return { label: name, labelType: 'burn' };
  return { label: name };
}

/**
 * Solana top holders. Moralis removed its solana-gateway top-holders endpoint on
 * 2026-07-31 (every request now 404s), so the ranked list comes from Vybe
 * (/v4/tokens/{mint}/top-holders — on the free key, 150 holders in one call),
 * with the Helius token-account scan as the fallback for tokens Vybe hasn't
 * indexed yet.
 */
export async function fetchHoldersSOL(mint: string): Promise<HolderFetch> {
  const holders: RawHolder[] = [];
  const labels = new Map<string, AddrLabel>();
  if (VYBE_KEY) {
    const url = `https://api.vybenetwork.xyz/v4/tokens/${mint}/top-holders?limit=${TOP_HOLDERS}&page=0`;
    const data = await fetchJson(url, { headers: { 'X-API-KEY': VYBE_KEY } });
    for (const h of data?.data || []) {
      const addr = h.ownerAddress;
      if (!addr) continue;
      holders.push({
        address: addr,
        balanceFormatted: Number(h.balance) || 0,
        pct: Number(h.percentageOfSupplyHeld) || 0,
        usdValue: Number(h.valueUsd) || undefined,
      });
      const known = getExchangeInfo(addr, 'sol');
      const fromApi = classifyVybeOwnerName(h.ownerName);
      if (known) labels.set(addr, { label: known.name, labelType: known.type });
      else if (fromApi) labels.set(addr, fromApi);
    }
  }
  if (!holders.length) {
    // Brand-new tokens (pump.fun launches etc.) lag Moralis indexing. For small
    // tokens, aggregating raw token accounts by owner via Helius is feasible.
    const fallback = await fetchHoldersSOLFallback(mint);
    if (fallback) return fallback;
  }
  return { holders: holders.slice(0, TOP_HOLDERS), labels };
}

// Top-150 needs ALL token accounts (pages are unsorted). This path only triggers
// when Moralis's holder aggregation lags (young-but-hot tokens — they can hit six
// figures of token accounts within days), so the cap must cover that scale. A
// 150k-account token ≈ 150 calls ≈ 40s inside the build window.
const MAX_FALLBACK_PAGES = 250;
const FALLBACK_WAVE = 4;

async function fetchAccountsPage(rpc: string, mint: string, page: number): Promise<any[] | null> {
  const res = await tryFetchJson(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: page, method: 'getTokenAccounts', params: { mint, limit: 1000, page } }),
  });
  const accounts = res?.result?.token_accounts;
  return Array.isArray(accounts) ? accounts : null;
}

async function fetchHoldersSOLFallback(mint: string): Promise<HolderFetch | null> {
  const rpc = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
  const asset = await tryFetchJson(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
  });
  const supply = Number(asset?.result?.token_info?.supply);
  const decimals = Number(asset?.result?.token_info?.decimals ?? 6);
  if (!Number.isFinite(supply) || supply <= 0) return null;

  const byOwner = new Map<string, number>();
  let exhausted = false;
  for (let start = 1; start <= MAX_FALLBACK_PAGES && !exhausted; start += FALLBACK_WAVE) {
    const pages = Array.from({ length: Math.min(FALLBACK_WAVE, MAX_FALLBACK_PAGES - start + 1) }, (_, i) => start + i);
    const waves = await Promise.all(pages.map(page => fetchAccountsPage(rpc, mint, page)));
    for (let i = 0; i < waves.length; i++) {
      let accounts = waves[i];
      if (!accounts) {
        // Transient RPC failure — one retry after a breather before declaring the
        // scan unusable (a partial view would misrepresent the top holders).
        await sleep(1500);
        accounts = await fetchAccountsPage(rpc, mint, pages[i]);
        if (!accounts) {
          console.error(`[graph] sol:${mint} fallback scan aborted at page ${pages[i]}`);
          return null;
        }
      }
      if (!accounts.length || accounts.length < 1000) exhausted = true;
      for (const a of accounts) {
        if (a.owner) byOwner.set(a.owner, (byOwner.get(a.owner) || 0) + Number(a.amount || 0));
      }
    }
    if (!exhausted && start + FALLBACK_WAVE > MAX_FALLBACK_PAGES) return null; // token too large for this path
    if (!exhausted) await sleep(250);
  }
  if (!byOwner.size) return null;

  console.log(`[graph] sol:${mint} using Helius token-account fallback (${byOwner.size} owners)`);
  const labels = new Map<string, AddrLabel>();
  const holders: RawHolder[] = [...byOwner.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_HOLDERS)
    .map(([address, raw]) => {
      const known = getExchangeInfo(address, 'sol');
      if (known) labels.set(address, { label: known.name, labelType: known.type });
      return {
        address,
        balanceFormatted: raw / Math.pow(10, decimals),
        pct: (raw / supply) * 100,
      };
    });
  return { holders, labels };
}

export async function fetchTransfersSOL(
  mint: string, holders: RawHolder[], labels: Map<string, AddrLabel>,
): Promise<TransferFetch> {
  const out = new Map<string, RawTransfer[]>();
  let failedWallets = 0;
  await batched(holders, CONCURRENCY.sol, BATCH_DELAY_MS.sol, async (h) => {
    const transfers: RawTransfer[] = [];
    // Enhanced Transactions: bare array; tokenTransfers[] carry owner wallets. No server-side
    // mint filter exists — filter client-side. type=TRANSFER keeps wallet-to-wallet moves.
    const url = `${HELIUS_TX}/addresses/${h.address}/transactions?api-key=${HELIUS_KEY}&limit=100&type=TRANSFER`;
    let data;
    try {
      data = await fetchJson(url);
    } catch {
      failedWallets++;
      out.set(h.address, transfers);
      return;
    }
    if (Array.isArray(data)) {
      for (const tx of data) {
        for (const tt of tx.tokenTransfers || []) {
          if (tt.mint !== mint) continue;
          if (!tt.fromUserAccount || !tt.toUserAccount) continue;
          transfers.push({ from: tt.fromUserAccount, to: tt.toUserAccount, id: tx.signature });
          for (const addr of [tt.fromUserAccount, tt.toUserAccount]) {
            if (labels.has(addr)) continue;
            const known = getExchangeInfo(addr, 'sol');
            if (known) labels.set(addr, { label: known.name, labelType: known.type });
          }
        }
      }
    }
    out.set(h.address, transfers);
  });
  return { transfers: out, failedWallets };
}

export async function fetchMetaSOL(mint: string, holderCount: number): Promise<TokenMeta> {
  const [meta, dex, asset] = await Promise.all([
    tryFetchJson(`${MORALIS_SOL}/token/mainnet/${mint}/metadata`, moralisHeaders),
    tryFetchJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`),
    tryFetchJson(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
    }),
  ]);
  const pair = bestPair(dex?.pairs, mint, 'sol');
  const tokenInfo = asset?.result?.token_info;
  return {
    name: meta?.name || asset?.result?.content?.metadata?.name || pair?.baseToken?.name || '',
    symbol: (meta?.symbol || tokenInfo?.symbol || pair?.baseToken?.symbol || '').replace(/^\$/, ''),
    logo: pair?.info?.imageUrl || meta?.logo || asset?.result?.content?.links?.image || '',
    price: firstFinite(pair?.priceUsd, tokenInfo?.price_info?.price_per_token),
    priceChange24h: firstFinite(pair?.priceChange?.h24),
    marketCap: firstFinite(pair?.marketCap, pair?.fdv, meta?.marketCap),
    volume24h: sumVolume24h(dex?.pairs, mint, 'sol'),
    holderCount,
    liquidityUsd: firstFinite(pair?.liquidity?.usd),
  };
}

// ---------- DexScreener helpers ----------

const DEX_CHAIN_TO_OURS: Record<string, string> = { ethereum: 'eth', bsc: 'bsc', base: 'base', solana: 'sol', robinhood: 'robinhood' };

/**
 * Pairs on our chain where the token is the BASE. DexScreener's /tokens/{addr}
 * also returns pairs where the token is the QUOTE, and priceUsd / marketCap /
 * priceChange always describe the base token — reading those off a quote-side
 * pair yields another token's numbers entirely.
 */
function chainPairs(pairs: any[] | undefined, token: string, chain?: string): any[] {
  if (!pairs?.length) return [];
  const t = token.toLowerCase();
  let out = pairs.filter(p => (p.baseToken?.address || '').toLowerCase() === t);
  if (chain) {
    const slug = Object.entries(DEX_CHAIN_TO_OURS).find(([, v]) => v === chain)?.[0];
    out = out.filter(p => p.chainId === slug);
  }
  return out;
}

export function bestPair(pairs: any[] | undefined, token: string, chain?: string): any | null {
  const candidates = chainPairs(pairs, token, chain);
  if (!candidates.length) return null;
  // Pairs are NOT sorted by liquidity — pick max explicitly.
  return candidates.reduce((a, b) => ((a.liquidity?.usd || 0) >= (b.liquidity?.usd || 0) ? a : b));
}

/** Token 24h DEX volume = sum across the chain's base-side pairs. */
export function sumVolume24h(pairs: any[] | undefined, token: string, chain?: string): number {
  return chainPairs(pairs, token, chain).reduce((s, p) => s + (Number(p.volume?.h24) || 0), 0);
}

export interface Resolved {
  address: string;
  chain: string;
}

const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Resolve user input (ticker or raw contract address) to { address, chain }.
 * Raw addresses always resolve by format; tickers go through DexScreener search
 * ranked by liquidity. Returns null when nothing plausible is found.
 */
export async function resolveTokenInput(input: string, chainHint: string): Promise<Resolved | null> {
  const q = input.trim();

  if (EVM_ADDR_RE.test(q)) {
    // Which EVM chain? Ask DexScreener; fall back to the hint (never fail a valid address
    // just because DexScreener is down).
    const dex = await tryFetchJson(`https://api.dexscreener.com/latest/dex/tokens/${q}`);
    const supported = (dex?.pairs || []).filter((p: any) => DEX_CHAIN_TO_OURS[p.chainId]);
    if (supported.length) {
      const best = supported.reduce((a: any, b: any) => ((a.liquidity?.usd || 0) >= (b.liquidity?.usd || 0) ? a : b));
      return { address: q, chain: DEX_CHAIN_TO_OURS[best.chainId] };
    }
    return { address: q, chain: chainHint !== 'sol' ? chainHint : 'eth' };
  }

  if (BASE58_RE.test(q) && q.length >= 32) {
    return { address: q, chain: 'sol' };
  }

  // Ticker → DexScreener search, grouped by (chain, address). Symbol match is
  // case-insensitive and tolerates a "$" prefix (e.g. $WIF). Groups are scored by
  // the GEOMETRIC MEAN of liquidity and 24h volume, not liquidity alone: scam
  // copycats fake enormous liquidity but can't fake volume (regression case: the
  // top-liquidity "CASHCAT" on Robinhood Chain shows $81M liquidity and $0.03
  // volume — the real token has $10M/$30M and must win).
  const search = await fetchJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);
  const pairs = (search?.pairs || []).filter((p: any) => DEX_CHAIN_TO_OURS[p.chainId]);
  const want = q.toLowerCase().replace(/^\$/, '');
  const groups = new Map<string, { chain: string; address: string; liq: number; vol: number; symbolMatch: boolean }>();
  for (const p of pairs) {
    const sym = (p.baseToken?.symbol || '').toLowerCase().replace(/^\$/, '');
    const name = (p.baseToken?.name || '').toLowerCase();
    const key = `${p.chainId}:${p.baseToken?.address}`;
    const liq = p.liquidity?.usd || 0;
    const vol = Number(p.volume?.h24) || 0;
    const symbolMatch = sym === want || name === want;
    const g = groups.get(key);
    if (!g) groups.set(key, { chain: DEX_CHAIN_TO_OURS[p.chainId], address: p.baseToken?.address, liq, vol, symbolMatch });
    else { g.liq = Math.max(g.liq, liq); g.vol += vol; g.symbolMatch = g.symbolMatch || symbolMatch; }
  }
  const score = (g: { liq: number; vol: number }) => Math.sqrt(Math.max(g.liq, 1) * Math.max(g.vol, 1));
  const ranked = [...groups.values()]
    .filter(g => g.address && g.liq > 10_000)
    .sort((a, b) => (Number(b.symbolMatch) - Number(a.symbolMatch)) || (score(b) - score(a)));
  if (!ranked.length) return null;
  return { address: ranked[0].address, chain: ranked[0].chain };
}

// ---------- Chain dispatchers (shared with the background worker) ----------

export function fetchHolders(chain: string, address: string): Promise<HolderFetch> {
  if (chain === 'sol') return fetchHoldersSOL(address);
  if (isLogChain(chain)) return fetchHoldersLogs(address, chain);
  return fetchHoldersEVM(address, chain);
}

export function fetchTransfers(chain: string, address: string, holders: RawHolder[], labels: Map<string, AddrLabel>): Promise<TransferFetch> {
  if (chain === 'sol') return fetchTransfersSOL(address, holders, labels);
  if (isLogChain(chain)) return fetchTransfersLogs(address, chain, holders, labels);
  return fetchTransfersEVM(address, chain, holders, labels);
}

export function fetchTokenMeta(chain: string, address: string, holderCount: number): Promise<TokenMeta> {
  if (chain === 'sol') return fetchMetaSOL(address, holderCount);
  if (isLogChain(chain)) return fetchMetaLogs(address, chain, holderCount);
  return fetchMetaEVM(address, chain, holderCount);
}

// ---------- Entry point ----------

export interface ComputeResult {
  graph: TokenGraph;
  /** True when a meaningful share of transfer fetches failed — don't cache these. */
  partial: boolean;
}

export async function computeTokenGraph(address: string, chain: string): Promise<ComputeResult | null> {
  const t0 = Date.now();
  const isSol = chain === 'sol';

  // Holder fetch failures throw UpstreamError (surfaces as 500, not a bogus "not found").
  // Log-replay chains produce holders, histories and meta in one pass; a token too
  // large for a serverless request throws HeavyTokenError (→ worker hand-off).
  let holders: RawHolder[];
  let labels: Map<string, AddrLabel>;
  let snapshot: LogSnapshot | null = null;
  if (isLogChain(chain)) {
    snapshot = await fetchLogSnapshot(address, chain, { maxCalls: ONDEMAND_MAX_LOG_CALLS });
    ({ holders, labels } = snapshot);
  } else {
    ({ holders, labels } = isSol ? await fetchHoldersSOL(address) : await fetchHoldersEVM(address, chain));
  }
  console.log(`[graph] ${chain}:${address} holders=${holders.length} (${Date.now() - t0}ms)`);
  if (!holders.length) {
    // "Not found" is only true if DexScreener has never seen the address either —
    // otherwise the token is real and our holder sources just haven't indexed it.
    const dex = await tryFetchJson(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    if (dex?.pairs?.length) {
      throw new NotIndexedError('New token — holder data isn\'t indexed yet. Try again in a few minutes.');
    }
    return null;
  }

  const { transfers, failedWallets } = snapshot
    ? { transfers: snapshot.transfers, failedWallets: 0 }
    : isSol
      ? await fetchTransfersSOL(address, holders, labels)
      : await fetchTransfersEVM(address, chain, holders, labels);
  let transferCount = 0;
  for (const t of transfers.values()) transferCount += t.length;
  const partial = failedWallets > holders.length * 0.2;
  console.log(`[graph] ${chain}:${address} transfers=${transferCount} across ${transfers.size} wallets, ${failedWallets} failed${partial ? ' (PARTIAL — will not cache)' : ''} (${Date.now() - t0}ms)`);

  const meta = snapshot
    ? snapshot.meta
    : isSol
      ? await fetchMetaSOL(address, holders.length)
      : await fetchMetaEVM(address, chain, holders.length);

  const computedAt = new Date().toISOString();
  // Pass 1 determines the final ≤500-node set; the label resolver then works that
  // exact set (static list → wallet_labels cache → Solscan/heuristics → contract
  // detection), and pass 2 rebuilds so newly labeled CEX/burn wallets are pulled
  // out of clusters.
  const pass1 = buildGraph(chain, address, meta, holders, transfers, labels, computedAt);
  // Exchange wallets stand out by counterparty count — spend the per-address label
  // budget on the highest-degree unlabeled nodes first.
  const suspects = [
    ...pass1.nodes.filter(n => n.kind === 'holder' && !n.labelType).sort((a, b) => b.degree - a.degree).map(n => n.address),
    ...pass1.nodes
      .filter(n => n.kind === 'counterparty' && (!n.labelType || n.label === 'Exchange-like (unverified)') && n.degree >= 3)
      .sort((a, b) => b.degree - a.degree)
      .map(n => n.address),
  ];
  let graph = pass1;
  try {
    const resolved = await resolveWalletLabels(chain, {
      addresses: pass1.nodes.map(n => n.address),
      apiLabels: labels,
      suspects,
    });
    let changed = false;
    for (const [addr, lb] of resolved) {
      const prev = labels.get(addr);
      if (!prev || prev.label !== lb.label || prev.labelType !== lb.labelType) {
        labels.set(addr, lb);
        changed = true;
      }
    }
    if (changed) graph = buildGraph(chain, address, meta, holders, transfers, labels, computedAt);
  } catch (e) {
    console.error('[graph] label resolution failed, using pass-1 labels:', e instanceof Error ? e.message : e);
  }
  console.log(`[graph] ${chain}:${address} nodes=${graph.nodes.length} edges=${graph.edges.length} clusters=${graph.clusters.length} (${Date.now() - t0}ms total)`);
  return { graph, partial };
}

export { normAddr };
