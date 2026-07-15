// Trending tokens via GeckoTerminal (keyless, 30 req/min limit — we make 4/hour).
// Shared by /api/trending (discovery grid) and the daily seed cron.

export interface TrendingToken {
  chain: string;
  address: string;
  name: string;
  symbol: string;
  logo: string;
  change24h: number;
  volume24h: number;
}

// GeckoTerminal network slugs → our chain codes.
export const TRENDING_NETWORKS: [string, string][] = [['eth', 'eth'], ['bsc', 'bsc'], ['base', 'base'], ['solana', 'sol'], ['robinhood', 'robinhood']];

// Wrapped natives / stables trend constantly but their holder maps are noise
const SKIP_SYMBOLS = new Set(['WETH', 'WBNB', 'WSOL', 'SOL', 'WBTC', 'USDC', 'USDT', 'DAI', 'CBBTC']);

export async function fetchTrendingChain(net: string, chain: string, limit = 3): Promise<TrendingToken[]> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${net}/trending_pools?include=base_token`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
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
