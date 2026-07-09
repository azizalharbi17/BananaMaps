// Snapshot cache for computed token graphs (BubbleMaps' snapshot model).
// Primary store: Supabase table `token_graphs` (see supabase/migrations/).
// Fallback: per-instance in-memory map, used when Supabase is unreachable or
// unconfigured — the app stays fully functional, just without persistence.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TokenGraph } from './graphTypes';

export interface CachedGraph {
  graph: TokenGraph;
  computedAt: string;
}

// Pinned to globalThis so dev-mode module reloads (HMR) don't wipe it.
const memCache: Map<string, CachedGraph> =
  ((globalThis as any).__graphMemCache ||= new Map<string, CachedGraph>());
const key = (chain: string, address: string) => `${chain}:${address}`;

let sb: SupabaseClient | null | undefined; // undefined = not initialized yet
let sbFailedAt = 0; // after a failure, skip Supabase for a cooldown, then re-probe
const SB_RETRY_MS = 60_000;

const sbHealthy = () => Date.now() - sbFailedAt > SB_RETRY_MS;
const markSbFailed = (op: string, e: unknown) => {
  console.error(`[cache] supabase ${op} failed (memory fallback active):`, e instanceof Error ? e.message : e);
  sbFailedAt = Date.now();
};

function supa(): SupabaseClient | null {
  if (sb !== undefined) return sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer the service-role key for server-side writes; anon works if RLS allows.
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  sb = url && k
    ? createClient(url, k, {
        auth: { persistSession: false },
        // Bound every Supabase call so a dead project can't stall graph requests.
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4000) }) },
      })
    : null;
  return sb;
}

export async function getCachedGraph(chain: string, address: string): Promise<CachedGraph | null> {
  const client = supa();
  if (client && sbHealthy()) {
    try {
      const { data, error } = await client
        .from('token_graphs')
        .select('graph, computed_at')
        .eq('chain', chain)
        .eq('address', address)
        .maybeSingle();
      if (error) throw error;
      if (data?.graph) return { graph: data.graph as TokenGraph, computedAt: data.computed_at };
    } catch (e) {
      markSbFailed('read', e);
    }
  }
  return memCache.get(key(chain, address)) || null;
}

export async function setCachedGraph(chain: string, address: string, graph: TokenGraph): Promise<void> {
  const entry: CachedGraph = { graph, computedAt: graph.computedAt };
  memCache.set(key(chain, address), entry);
  const client = supa();
  if (!client || !sbHealthy()) return;
  try {
    const { error } = await client
      .from('token_graphs')
      .upsert({ chain, address, graph, computed_at: graph.computedAt }, { onConflict: 'chain,address' });
    if (error) throw error;
  } catch (e) {
    markSbFailed('write', e);
  }
}
