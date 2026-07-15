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

// RLS only allows writes from the service role (20260714_lock_cache_writes.sql).
// Without that key, skip write attempts entirely — a doomed anon write would trip
// the shared failure cooldown and needlessly degrade READS to the memory fallback.
const canWrite = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY;

function supa(): SupabaseClient | null {
  if (sb !== undefined) return sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer the service-role key for server-side writes; anon still reads.
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

// ---------- wallet_labels: resolved wallet labels, cached forever ----------

export interface WalletLabelRow {
  address: string;
  name: string;
  type: 'cex' | 'burn' | 'contract' | 'amm' | 'dex';
  source: string;
}

const memLabels: Map<string, WalletLabelRow> =
  ((globalThis as any).__walletLabelCache ||= new Map<string, WalletLabelRow>());

export async function getWalletLabels(chain: string, addresses: string[]): Promise<Map<string, WalletLabelRow>> {
  const out = new Map<string, WalletLabelRow>();
  const missing: string[] = [];
  for (const a of addresses) {
    const hit = memLabels.get(key(chain, a));
    if (hit) out.set(a, hit);
    else missing.push(a);
  }
  const client = supa();
  if (client && sbHealthy() && missing.length) {
    try {
      // Chunk the IN() lookups so a 500-node graph doesn't build an oversized query
      for (let i = 0; i < missing.length; i += 200) {
        const { data, error } = await client
          .from('wallet_labels')
          .select('address, name, type, source')
          .eq('chain', chain)
          .in('address', missing.slice(i, i + 200));
        if (error) throw error;
        for (const row of data || []) {
          const entry = row as WalletLabelRow;
          out.set(entry.address, entry);
          memLabels.set(key(chain, entry.address), entry);
        }
      }
    } catch (e) {
      markSbFailed('labels read', e);
    }
  }
  return out;
}

export async function setWalletLabels(chain: string, rows: WalletLabelRow[]): Promise<void> {
  if (!rows.length) return;
  for (const r of rows) memLabels.set(key(chain, r.address), r);
  const client = supa();
  if (!client || !sbHealthy() || !canWrite()) return;
  try {
    const { error } = await client
      .from('wallet_labels')
      .upsert(rows.map(r => ({ chain, ...r })), { onConflict: 'chain,address' });
    if (error) throw error;
  } catch (e) {
    markSbFailed('labels write', e);
  }
}

export async function setCachedGraph(chain: string, address: string, graph: TokenGraph): Promise<void> {
  const entry: CachedGraph = { graph, computedAt: graph.computedAt };
  memCache.set(key(chain, address), entry);
  const client = supa();
  if (!client || !sbHealthy() || !canWrite()) return;
  try {
    const { error } = await client
      .from('token_graphs')
      .upsert({ chain, address, graph, computed_at: graph.computedAt }, { onConflict: 'chain,address' });
    if (error) throw error;
  } catch (e) {
    markSbFailed('write', e);
  }
}
