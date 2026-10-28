// Trending tokens via GeckoTerminal (keyless, 30 req/min limit). Only the
// background worker calls GeckoTerminal (one snapshot per TRENDING_SNAPSHOT_EVERY_MS,
// stored in the worker_heartbeat row TRENDING_SNAPSHOT_ID); the visitor path
// (/api/trending, the homepage) reads that snapshot and never calls GT live.
import { recordProviderCall } from './providerMeter';

/** worker_heartbeat row id that carries the latest trending snapshot in its stats. */
export const TRENDING_SNAPSHOT_ID = 'trending';

export interface TrendingSnapshot {
  fetchedAt: string;
  /** Our chain code → tokens in GeckoTerminal's trending order. */
  byChain: Record<string, TrendingToken[]>;
}

export interface TrendingToken {
  chain: string;
  address: string;
  name: string;
  symbol: string;
  logo: string;
  change24h: number;
  volume24h: number;
  /** Set by /api/trending: a holder map snapshot already exists (opens instantly). */
  hasMap?: boolean;
}

// GeckoTerminal network slugs → our chain codes.
export const TRENDING_NETWORKS: [string, string][] = [['eth', 'eth'], ['bsc', 'bsc'], ['base', 'base'], ['solana', 'sol'], ['robinhood', 'robinhood']];

// Wrapped natives / stables trend constantly but their holder maps are noise
const SKIP_SYMBOLS = new Set(['WETH', 'WBNB', 'WSOL', 'SOL', 'WBTC', 'USDC', 'USDT', 'DAI', 'CBBTC']);

/** Identity of a trending token: chain + address, compared case-insensitively. */
export function trendingKey(t: Pick<TrendingToken, 'chain' | 'address'>): string {
  return `${t.chain}:${String(t.address || '').toLowerCase()}`;
}

/**
 * Collapse repeated tokens (same chain + address, any address casing) to one
 * entry. The higher-volume24h entry wins (ties: the first one), and it takes
 * the FIRST occurrence's slot so the trending order is preserved. Pure: never
 * mutates the input list or its items.
 *
 * app/components/chains.ts carries an identical client-side copy (client
 * components must not import lib/); keep the two in sync.
 */
export function dedupeTrending(list: TrendingToken[]): TrendingToken[] {
  const slot = new Map<string, number>();
  const out: TrendingToken[] = [];
  for (const t of list) {
    const key = trendingKey(t);
    const at = slot.get(key);
    if (at === undefined) {
      slot.set(key, out.length);
      out.push(t);
    } else if ((Number(t.volume24h) || 0) > (Number(out[at].volume24h) || 0)) {
      out[at] = t;
    }
  }
  return out;
}

/** Display identity for the lookalike pass: chain + symbol + name, case- and whitespace-insensitive. */
function lookalikeKey(t: TrendingToken): string | null {
  const norm = (s: unknown) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const symbol = norm(t.symbol);
  if (!symbol) return null;
  return `${t.chain}|${symbol}|${norm(t.name)}`;
}

/**
 * Display-layer pass on top of dedupeTrending(): two DIFFERENT contracts on the
 * same chain with the same symbol AND name (a copycat or relaunch — e.g. the two
 * "Elon 2028" / ELON2028 contracts on eth) are indistinguishable on a card, so
 * only the higher-volume24h one is shown, in the first occurrence's slot. The
 * worker snapshot keeps both contracts; this runs only where lists are rendered
 * (/api/trending and the client hook). Same-contract repeats must already be
 * collapsed by dedupeTrending(). Client copy: app/components/chains.ts.
 */
export function collapseLookalikes(list: TrendingToken[]): TrendingToken[] {
  const slot = new Map<string, number>();
  const out: TrendingToken[] = [];
  for (const t of list) {
    const key = lookalikeKey(t);
    const at = key === null ? undefined : slot.get(key);
    if (at === undefined) {
      if (key !== null) slot.set(key, out.length);
      out.push(t);
    } else if ((Number(t.volume24h) || 0) > (Number(out[at].volume24h) || 0)) {
      out[at] = t;
    }
  }
  return out;
}

/** What the homepage shows: same-contract repeats and same-name lookalikes collapsed. */
export function dedupeForDisplay(list: TrendingToken[]): TrendingToken[] {
  return collapseLookalikes(dedupeTrending(list));
}

export async function fetchTrendingChain(net: string, chain: string, limit = 3): Promise<TrendingToken[]> {
  try {
    recordProviderCall('https://api.geckoterminal.com/api/v2/networks/trending_pools');
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${net}/trending_pools?include=base_token`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    if (!Array.isArray(data?.data)) return []; // transient errors return a body without `data`
    const tokens = new Map<string, any>();
    for (const inc of data.included || []) {
      if (inc.type === 'token') tokens.set(inc.id, inc.attributes);
    }
    // Collect one candidate per pool over the WHOLE list, then dedupe by
    // chain + lowercased address (trendingKey) so a token that trends in
    // several pools appears once, with its higher-volume pool's stats. The
    // lowercasing is defensive against any id/address casing drift, not a
    // behaviour we have observed from GeckoTerminal (ids are `{net}_{address}`).
    // Dedupe before slicing to `limit`, or a duplicate past the cut-off would
    // survive. NOTE: this does NOT collapse different contracts that share a
    // ticker (e.g. two ELON2028 contracts on eth, 0xbcc01eae… and 0x7f4457f8…):
    // those are distinct tokens and are kept on purpose — merging by symbol
    // would be a product decision, not a dedupe fix.
    const candidates: TrendingToken[] = [];
    for (const pool of data.data) {
      const tokId = pool.relationships?.base_token?.data?.id;
      const tok = tokId && tokens.get(tokId);
      if (!tok?.address) continue;
      if (SKIP_SYMBOLS.has(String(tok.symbol || '').toUpperCase())) continue;
      candidates.push({
        chain,
        address: tok.address,
        name: tok.name || tok.symbol || '',
        symbol: tok.symbol || '',
        logo: tok.image_url && tok.image_url !== 'missing.png' ? tok.image_url : '',
        change24h: Number(pool.attributes?.price_change_percentage?.h24) || 0,
        volume24h: Number(pool.attributes?.volume_usd?.h24) || 0,
      });
    }
    return dedupeTrending(candidates).slice(0, limit);
  } catch {
    return [];
  }
}

/** One GeckoTerminal round over every chain (worker only). */
export async function fetchTrendingSnapshot(perChain = 8): Promise<TrendingSnapshot> {
  const lists = await Promise.all(TRENDING_NETWORKS.map(([net, chain]) => fetchTrendingChain(net, chain, perChain)));
  const byChain: Record<string, TrendingToken[]> = {};
  TRENDING_NETWORKS.forEach(([, chain], i) => { byChain[chain] = lists[i]; });
  return { fetchedAt: new Date().toISOString(), byChain };
}
