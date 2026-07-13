import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// GeckoTerminal network slugs → our chain codes. One keyless call per chain,
// 30 req/min limit — hourly caching keeps us far under it.
const NETWORKS: [string, string][] = [['eth', 'eth'], ['bsc', 'bsc'], ['base', 'base'], ['solana', 'sol']];
const TTL_MS = 3600_000;

export interface TrendingToken {
  chain: string;
  address: string;
  name: string;
  symbol: string;
  logo: string;
  change24h: number;
  volume24h: number;
}

interface TrendingPayload {
  popular: TrendingToken[];
  trending: TrendingToken[];
  fetchedAt: number;
}

const cache: { payload: TrendingPayload | null } = ((globalThis as any).__trendingCache ||= { payload: null });

async function fetchTrendingChain(net: string, chain: string): Promise<TrendingToken[]> {
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
    // Wrapped natives / stables trend constantly but their holder maps are noise
    const SKIP = new Set(['WETH', 'WBNB', 'WSOL', 'SOL', 'WBTC', 'USDC', 'USDT', 'DAI', 'CBBTC']);
    for (const pool of data.data) {
      const tokId = pool.relationships?.base_token?.data?.id;
      const tok = tokId && tokens.get(tokId);
      if (!tok?.address || seen.has(tokId)) continue;
      if (SKIP.has(String(tok.symbol || '').toUpperCase())) continue;
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
      if (out.length >= 3) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Tokens we already have snapshots for — these load instantly. */
async function fetchPopular(): Promise<TrendingToken[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const sb = createClient(url, key, {
      auth: { persistSession: false },
      global: { fetch: (i, o) => fetch(i, { ...o, signal: AbortSignal.timeout(4000) }) },
    });
    const { data, error } = await sb
      .from('token_graphs')
      .select('chain, address, graph->name, graph->symbol, graph->logo, graph->priceChange24h, graph->volume24h')
      .order('computed_at', { ascending: false })
      .limit(12);
    if (error) throw error;
    return (data || []).map((r: any) => ({
      chain: r.chain,
      address: r.address,
      name: String(r.name || ''),
      symbol: String(r.symbol || ''),
      logo: String(r.logo || ''),
      change24h: Number(r.priceChange24h) || 0,
      volume24h: Number(r.volume24h) || 0,
    })).filter(t => t.name || t.symbol);
  } catch {
    return [];
  }
}

export async function GET() {
  if (cache.payload && Date.now() - cache.payload.fetchedAt < TTL_MS) {
    return NextResponse.json(cache.payload);
  }
  const [popular, ...chains] = await Promise.all([
    fetchPopular(),
    ...NETWORKS.map(([net, chain]) => fetchTrendingChain(net, chain)),
  ]);
  // Interleave chains so no single chain dominates the grid
  const trending: TrendingToken[] = [];
  for (let i = 0; i < 3; i++) for (const list of chains) if (list[i]) trending.push(list[i]);
  const payload: TrendingPayload = { popular, trending: trending.slice(0, 12), fetchedAt: Date.now() };
  if (popular.length || trending.length) cache.payload = payload;
  return NextResponse.json(payload);
}
