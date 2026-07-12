// Server-side only. Fetches holders + transfer histories and assembles a TokenGraph.
// API mechanics (pagination, field names, rate behavior) verified against live endpoints 2026-07-08.
import { TokenGraph } from './graphTypes';
import { buildGraph, normAddr, RawHolder, RawTransfer, AddrLabel, TokenMeta } from './graphCore';
import { getExchangeInfo } from './exchanges';
import { resolveWalletLabels } from './labelResolver';

const MORALIS_KEY = process.env.MORALIS_API_KEY!;
const HELIUS_KEY = process.env.HELIUS_API_KEY!;
const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2.2';
const MORALIS_SOL = 'https://solana-gateway.moralis.io';
const HELIUS_TX = 'https://api.helius.xyz/v0';

export const MORALIS_CHAIN: Record<string, string> = { eth: '0x1', bsc: '0x38', base: '0x2105' };
export const CHAIN_LABEL: Record<string, string> = { eth: 'Ethereum', bsc: 'BSC', sol: 'Solana', base: 'Base' };

const TOP_HOLDERS = 150;
const TRANSFER_PAGES_PER_WALLET = 1; // 100 transfers per holder
const CONCURRENCY: Record<string, number> = { sol: 3, evm: 3 };
const BATCH_DELAY_MS: Record<string, number> = { sol: 400, evm: 350 };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const FETCH_TIMEOUT_MS = 15_000;

/** Upstream is broken (rate-limited, 5xx, network) — distinct from "no such token". */
export class UpstreamError extends Error {}

/**
 * GET/POST JSON with timeout + retry.
 * Returns null for 4xx no-data responses (bad token, nothing there).
 * Throws UpstreamError for persistent 401/403/429/5xx/network failures so callers
 * can distinguish "token not found" from "our data source is down".
 */
async function fetchJson(url: string, init?: RequestInit, retries = 2): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
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
async function tryFetchJson(url: string, init?: RequestInit): Promise<any> {
  try {
    return await fetchJson(url, init, 1);
  } catch {
    return null;
  }
}

const moralisHeaders = { headers: { 'X-API-Key': MORALIS_KEY } };

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

interface HolderFetch {
  holders: RawHolder[];
  labels: Map<string, AddrLabel>;
}

const CEX_NAME_RE = /binance|coinbase|kraken|okx|bybit|upbit|kucoin|gate\.?io|huobi|htx|bitget|mexc|crypto\.com|bitfinex|gemini|robinhood|bithumb|korbit|paribu|bitvavo|coinone|bitflyer|coincheck|bitso|btcturk|bitstamp|okcoin|poloniex|wazirx|indodax|exchange/i;

function classifyMoralisLabel(label: string | null, entity: string | null, isContract: boolean): AddrLabel | null {
  const name = entity || label;
  if (name && CEX_NAME_RE.test(name)) return { label: name, labelType: 'cex' };
  if (name && /uniswap|pancake|sushiswap|1inch|curve|balancer|aerodrome|router|\bdex\b/i.test(name)) return { label: name, labelType: 'dex' };
  // Moralis labels vanity burn wallets "Null: 0xdea...069"
  if (name && /burn|^null[: ]|null address|dead|incinerat/i.test(name)) return { label: name, labelType: 'burn' };
  if (name) return isContract ? { label: name, labelType: 'contract' } : { label: name };
  if (isContract) return { label: 'Contract', labelType: 'contract' };
  return null;
}

async function fetchHoldersEVM(token: string, chain: string): Promise<HolderFetch> {
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

interface TransferFetch {
  transfers: Map<string, RawTransfer[]>;
  /** Wallets whose history fetch errored (vs. genuinely having no transfers). */
  failedWallets: number;
}

async function fetchTransfersEVM(
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

async function fetchMetaEVM(token: string, chain: string, holderCount: number): Promise<TokenMeta> {
  const chainId = MORALIS_CHAIN[chain] || '0x1';
  const [price, dex] = await Promise.all([
    tryFetchJson(`${MORALIS_BASE}/erc20/${token}/price?chain=${chainId}&include=percent_change`, moralisHeaders),
    tryFetchJson(`https://api.dexscreener.com/latest/dex/tokens/${token}`),
  ]);
  const pair = bestPair(dex?.pairs, chain);
  return {
    name: price?.tokenName || pair?.baseToken?.name || '',
    symbol: price?.tokenSymbol || pair?.baseToken?.symbol || '',
    logo: price?.tokenLogo || pair?.info?.imageUrl || '',
    price: firstFinite(price?.usdPrice, pair?.priceUsd),
    priceChange24h: firstFinite(price?.usdPrice24hrPercentChange, pair?.priceChange?.h24),
    holderCount,
  };
}

// ---------- Solana (Moralis solana-gateway + Helius Enhanced Transactions) ----------

async function fetchHoldersSOL(mint: string): Promise<HolderFetch> {
  const holders: RawHolder[] = [];
  const labels = new Map<string, AddrLabel>();
  let cursor = '';
  while (holders.length < TOP_HOLDERS) {
    const url = `${MORALIS_SOL}/token/mainnet/${mint}/top-holders?limit=100${cursor ? `&cursor=${cursor}` : ''}`;
    let data;
    try {
      data = await fetchJson(url, moralisHeaders);
    } catch (e) {
      if (!holders.length) throw e; // first page down = source down; later pages degrade
      break;
    }
    if (!data?.result?.length) break;
    for (const h of data.result) {
      const addr = h.ownerAddress;
      holders.push({
        address: addr,
        balanceFormatted: Number(h.balanceFormatted),
        pct: Number(h.percentageRelativeToTotalSupply) || 0,
        usdValue: Number(h.usdValue) || undefined,
      });
      const known = getExchangeInfo(addr, 'sol');
      if (known) labels.set(addr, { label: known.name, labelType: known.type });
      else if (h.isContract) labels.set(addr, { label: 'Contract', labelType: 'contract' });
    }
    cursor = data.cursor || '';
    if (!cursor) break;
    await sleep(250);
  }
  return { holders: holders.slice(0, TOP_HOLDERS), labels };
}

async function fetchTransfersSOL(
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

async function fetchMetaSOL(mint: string, holderCount: number): Promise<TokenMeta> {
  const [meta, dex, asset] = await Promise.all([
    tryFetchJson(`${MORALIS_SOL}/token/mainnet/${mint}/metadata`, moralisHeaders),
    tryFetchJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`),
    tryFetchJson(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
    }),
  ]);
  const pair = bestPair(dex?.pairs, 'sol');
  const tokenInfo = asset?.result?.token_info;
  return {
    name: meta?.name || asset?.result?.content?.metadata?.name || pair?.baseToken?.name || '',
    symbol: (meta?.symbol || tokenInfo?.symbol || pair?.baseToken?.symbol || '').replace(/^\$/, ''),
    logo: pair?.info?.imageUrl || meta?.logo || asset?.result?.content?.links?.image || '',
    price: firstFinite(pair?.priceUsd, tokenInfo?.price_info?.price_per_token),
    priceChange24h: firstFinite(pair?.priceChange?.h24),
    holderCount,
  };
}

// ---------- DexScreener helpers ----------

const DEX_CHAIN_TO_OURS: Record<string, string> = { ethereum: 'eth', bsc: 'bsc', base: 'base', solana: 'sol' };

function bestPair(pairs: any[] | undefined, chain?: string): any | null {
  if (!pairs?.length) return null;
  let candidates = pairs;
  if (chain) {
    const slug = Object.entries(DEX_CHAIN_TO_OURS).find(([, v]) => v === chain)?.[0];
    candidates = pairs.filter(p => p.chainId === slug);
  }
  if (!candidates.length) return null;
  // Pairs are NOT sorted by liquidity — pick max explicitly.
  return candidates.reduce((a, b) => ((a.liquidity?.usd || 0) >= (b.liquidity?.usd || 0) ? a : b));
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

  // Ticker → DexScreener search, grouped by (chain, address), scored by max liquidity.
  // Symbol match is case-insensitive and tolerates a "$" prefix (e.g. $WIF).
  const search = await fetchJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);
  const pairs = (search?.pairs || []).filter((p: any) => DEX_CHAIN_TO_OURS[p.chainId]);
  const want = q.toLowerCase().replace(/^\$/, '');
  const groups = new Map<string, { chain: string; address: string; liq: number; symbolMatch: boolean }>();
  for (const p of pairs) {
    const sym = (p.baseToken?.symbol || '').toLowerCase().replace(/^\$/, '');
    const name = (p.baseToken?.name || '').toLowerCase();
    const key = `${p.chainId}:${p.baseToken?.address}`;
    const liq = p.liquidity?.usd || 0;
    const symbolMatch = sym === want || name === want;
    const g = groups.get(key);
    if (!g) groups.set(key, { chain: DEX_CHAIN_TO_OURS[p.chainId], address: p.baseToken?.address, liq, symbolMatch });
    else { g.liq = Math.max(g.liq, liq); g.symbolMatch = g.symbolMatch || symbolMatch; }
  }
  const ranked = [...groups.values()]
    .filter(g => g.address && g.liq > 10_000)
    .sort((a, b) => (Number(b.symbolMatch) - Number(a.symbolMatch)) || (b.liq - a.liq));
  if (!ranked.length) return null;
  return { address: ranked[0].address, chain: ranked[0].chain };
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
  const { holders, labels } = isSol ? await fetchHoldersSOL(address) : await fetchHoldersEVM(address, chain);
  console.log(`[graph] ${chain}:${address} holders=${holders.length} (${Date.now() - t0}ms)`);
  if (!holders.length) return null;

  const { transfers, failedWallets } = isSol
    ? await fetchTransfersSOL(address, holders, labels)
    : await fetchTransfersEVM(address, chain, holders, labels);
  let transferCount = 0;
  for (const t of transfers.values()) transferCount += t.length;
  const partial = failedWallets > holders.length * 0.2;
  console.log(`[graph] ${chain}:${address} transfers=${transferCount} across ${transfers.size} wallets, ${failedWallets} failed${partial ? ' (PARTIAL — will not cache)' : ''} (${Date.now() - t0}ms)`);

  const meta = isSol ? await fetchMetaSOL(address, holders.length) : await fetchMetaEVM(address, chain, holders.length);

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
