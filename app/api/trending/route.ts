import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TrendingToken, TrendingSnapshot, TRENDING_NETWORKS, TRENDING_SNAPSHOT_ID } from '@/lib/trending';

export const dynamic = 'force-dynamic';

// Everything here is served from our own database: the worker publishes
// GeckoTerminal's trending lists every 30 minutes (worker_heartbeat row
// 'trending'), and "popular" is whatever we hold fresh snapshots for. No
// upstream API is ever called on a visitor's request.
const TTL_MS = 60_000;

export interface TrendingPayload {
  /** Tokens with a ready holder map (instant). */
  popular: TrendingToken[];
  /** Trending across chains, interleaved (legacy discovery grid). */
  trending: TrendingToken[];
  /** Trending per chain, in GeckoTerminal order: eth / bsc / sol / base / robinhood. */
  byChain: Record<string, TrendingToken[]>;
  /** When the worker fetched the trending lists (ISO); null when no snapshot exists yet. */
  trendingAt: string | null;
  fetchedAt: number;
}

const cache: { payload: TrendingPayload | null } = ((globalThis as any).__trendingCache2 ||= { payload: null });

function client(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (i, o) => fetch(i, { ...o, signal: AbortSignal.timeout(4000) }) },
  });
}

/** Tokens we already have snapshots for — these load instantly. */
async function fetchPopular(sb: SupabaseClient): Promise<TrendingToken[]> {
  try {
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
      hasMap: true,
    })).filter(t => t.name || t.symbol);
  } catch {
    return [];
  }
}

async function fetchSnapshot(sb: SupabaseClient): Promise<TrendingSnapshot | null> {
  try {
    const { data, error } = await sb.from('worker_heartbeat').select('stats').eq('id', TRENDING_SNAPSHOT_ID).maybeSingle();
    if (error) throw error;
    const s = data?.stats as Partial<TrendingSnapshot> | null;
    if (!s?.byChain || typeof s.byChain !== 'object') return null;
    return { fetchedAt: String(s.fetchedAt || ''), byChain: s.byChain };
  } catch {
    return null;
  }
}

/** Mark which trending tokens already have a map (instant open vs. first build). */
async function markHasMap(sb: SupabaseClient, tokens: TrendingToken[]): Promise<void> {
  if (!tokens.length) return;
  try {
    const { data, error } = await sb
      .from('token_graphs')
      .select('chain, address')
      .in('address', tokens.map(t => t.address.toLowerCase()).concat(tokens.map(t => t.address)));
    if (error) throw error;
    const have = new Set((data || []).map((r: any) => `${r.chain}:${String(r.address).toLowerCase()}`));
    for (const t of tokens) t.hasMap = have.has(`${t.chain}:${t.address.toLowerCase()}`);
  } catch { /* best effort */ }
}

export async function GET() {
  if (cache.payload && Date.now() - cache.payload.fetchedAt < TTL_MS) {
    return NextResponse.json(cache.payload);
  }
  const sb = client();
  const empty: TrendingPayload = { popular: [], trending: [], byChain: {}, trendingAt: null, fetchedAt: Date.now() };
  if (!sb) return NextResponse.json(empty);
  const [popular, snap] = await Promise.all([fetchPopular(sb), fetchSnapshot(sb)]);
  const byChain: Record<string, TrendingToken[]> = {};
  for (const [, chain] of TRENDING_NETWORKS) byChain[chain] = (snap?.byChain[chain] || []).map(t => ({ ...t }));
  await markHasMap(sb, Object.values(byChain).flat());
  // Interleave chains so no single chain dominates the legacy grid
  const trending: TrendingToken[] = [];
  for (let i = 0; i < 3; i++) for (const [, chain] of TRENDING_NETWORKS) if (byChain[chain][i]) trending.push(byChain[chain][i]);
  const payload: TrendingPayload = { popular, trending: trending.slice(0, 12), byChain, trendingAt: snap?.fetchedAt || null, fetchedAt: Date.now() };
  if (popular.length || trending.length) cache.payload = payload;
  return NextResponse.json(payload);
}
