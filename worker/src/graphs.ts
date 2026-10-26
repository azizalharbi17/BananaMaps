// Where finished graphs are read from / written to (token_graphs). Normally the
// same place as the registry; the split exists so a file-store dev run can still
// bootstrap from (and, when asked, publish to) the production table.
//
// The worker talks to token_graphs with its OWN service-role client rather than
// lib/graphCache: that helper is tuned for request-path latency (4 s timeout,
// silent memory fallback), which here would turn a slow read into a phantom
// "no cached graph" (→ a 160-call full build) or swallow a failed write. Same
// table, same role, same upsert — just with errors that surface.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { TokenGraph } from '../../lib/graphTypes';
import { cfg } from './config';
import { log } from './log';
import type { Store, GraphKey } from './store';

export interface GraphRepo {
  kind: 'supabase' | 'file';
  dryRun: boolean;
  get(chain: string, address: string): Promise<{ graph: TokenGraph; computedAt: string } | null>;
  save(chain: string, address: string, graph: TokenGraph): Promise<boolean>;
  listKeys(): Promise<GraphKey[]>;
}

export function serviceClient(timeoutMs = 20_000): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (i, o) => fetch(i, { ...o, signal: AbortSignal.timeout(timeoutMs) }) },
  });
}

export async function readGraphRow(sb: SupabaseClient, chain: string, address: string) {
  const { data, error } = await sb.from('token_graphs').select('graph, computed_at').eq('chain', chain).eq('address', address).maybeSingle();
  if (error) throw error;
  return data?.graph ? { graph: data.graph as TokenGraph, computedAt: data.computed_at as string } : null;
}

export async function upsertGraphRow(sb: SupabaseClient, chain: string, address: string, graph: TokenGraph) {
  const { error } = await sb.from('token_graphs')
    .upsert({ chain, address, graph, computed_at: graph.computedAt }, { onConflict: 'chain,address' });
  if (error) throw error;
}

export async function listGraphRows(sb: SupabaseClient): Promise<GraphKey[]> {
  const out: GraphKey[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('token_graphs')
      .select('chain, address, computed_at, graph->symbol, graph->name, graph->volume24h')
      .order('computed_at', { ascending: false }).range(from, from + 999);
    if (error) throw error;
    for (const r of (data || []) as any[]) out.push({ chain: r.chain, address: r.address, computedAt: r.computed_at, symbol: String(r.symbol || ''), name: String(r.name || ''), volume24h: Number(r.volume24h) || 0 });
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function createGraphRepo(store: Store): GraphRepo {
  const dryRun = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
  if (cfg.graphSink === 'file' || store.kind === cfg.graphSink) {
    return {
      kind: store.kind, dryRun,
      get: (c, a) => store.getGraph(c, a),
      save: async (c, a, g) => {
        if (dryRun) { log.info('dry-run: graph not written', { chain: c, address: a, nodes: g.nodes.length }); return false; }
        await store.saveGraph(c, a, g);
        return true;
      },
      listKeys: () => store.listGraphKeys(),
    };
  }
  // store=file, sink=supabase
  const sb = serviceClient();
  return {
    kind: 'supabase', dryRun,
    get: (c, a) => readGraphRow(sb, c, a),
    save: async (c, a, g) => {
      if (dryRun) { log.info('dry-run: graph not written', { chain: c, address: a, nodes: g.nodes.length }); return false; }
      await upsertGraphRow(sb, c, a, g);
      return true;
    },
    listKeys: () => listGraphRows(sb),
  };
}
