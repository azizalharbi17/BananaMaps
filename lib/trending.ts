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
    const out: TrendingToken[] = [];
    const seen = new Set<string>();
    for (const pool of data.data) {
      const tokId = pool.relationships?.base_token?.data?.id;
      const tok = tokId && tokens.get(tokId);
      if (!tok?.address || seen.has(tokId)) continue;
      if (SKIP_SYMBOLS.has(String(tok.symbol || '').toUpperCase())) continue;
      seen.add(tokId);
      out.push({
        chain,
        address: tok.address,
        name: tok.name || tok.symbol || '',
        symbol: tok.symbol || '',
        logo: tok.image_url && tok.image_url !== 'missing.png' ? tok.image_url : '',
        change24h: Number(pool.attributes?.price_change_percentage?.h24) || 0,
        volume24h: Number(pool.attributes?.volume_usd?.h24) || 0,
      });
      if (out.length >= limit) break;
    }
    return out;
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
