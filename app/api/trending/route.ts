import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchTrendingChain, TrendingToken, TRENDING_NETWORKS } from '@/lib/trending';

export const dynamic = 'force-dynamic';

const TTL_MS = 3600_000;

interface TrendingPayload {
  popular: TrendingToken[];
  trending: TrendingToken[];
  fetchedAt: number;
}

const cache: { payload: TrendingPayload | null } = ((globalThis as any).__trendingCache ||= { payload: null });

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
    ...TRENDING_NETWORKS.map(([net, chain]) => fetchTrendingChain(net, chain)),
  ]);
  // Interleave chains so no single chain dominates the grid
  const trending: TrendingToken[] = [];
  for (let i = 0; i < 3; i++) for (const list of chains) if (list[i]) trending.push(list[i]);
  const payload: TrendingPayload = { popular, trending: trending.slice(0, 12), fetchedAt: Date.now() };
  if (popular.length || trending.length) cache.payload = payload;
  return NextResponse.json(payload);
}
