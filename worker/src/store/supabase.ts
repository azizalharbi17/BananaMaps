// Production store: one service-role client with a generous timeout (state
// blobs are a few hundred KB). Graphs land in the same token_graphs rows the
// on-demand builder writes (same upsert, same service role).
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { TokenGraph } from '../../../lib/graphTypes';
import { readGraphRow, upsertGraphRow, listGraphRows } from '../graphs';
import type { SyncState } from '../state';
import { STATE_VERSION } from '../state';
import { Store, TokenRow, TokenPatch, GraphKey, HeartbeatRow } from './types';

const TIER_RANK: Record<string, number> = { hot: 0, warm: 1, cold: 2 };

export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  private sb: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.sb = createClient(url, serviceKey, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) },
    });
  }

  async init() {
    // Fail fast with a clear message if the migration hasn't been applied.
    const { error } = await this.sb.from('indexed_tokens').select('chain', { head: true, count: 'exact' });
    if (error) throw new Error(`indexed_tokens not reachable — apply supabase/migrations/20261021_worker_indexing.sql (${error.message})`);
  }

  async listTokens() {
    const out: TokenRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from('indexed_tokens').select('*').order('chain').order('address').range(from, from + 999);
      if (error) throw error;
      out.push(...((data || []) as TokenRow[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async getToken(chain: string, address: string) {
    const { data, error } = await this.sb.from('indexed_tokens').select('*').eq('chain', chain).eq('address', address).maybeSingle();
    if (error) throw error;
    return (data as TokenRow | null) || null;
  }

  async insertMissing(rows: Array<Pick<TokenRow, 'chain' | 'address'> & TokenPatch>) {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { data, error } = await this.sb
        .from('indexed_tokens')
        .upsert(chunk, { onConflict: 'chain,address', ignoreDuplicates: true })
        .select('chain');
      if (error) throw error;
      inserted += data?.length || 0;
    }
    return inserted;
  }

  async updateToken(chain: string, address: string, patch: TokenPatch) {
    const { error } = await this.sb.from('indexed_tokens')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('chain', chain).eq('address', address);
    if (error) throw error;
  }

  async claimToken(chain: string, address: string, owner: string, staleMs: number) {
    const stale = new Date(Date.now() - staleMs).toISOString();
    const { data, error } = await this.sb.from('indexed_tokens')
      .update({ sync_started_at: new Date().toISOString(), lock_owner: owner })
      .eq('chain', chain).eq('address', address)
      .or(`sync_started_at.is.null,sync_started_at.lt.${stale}`)
      .select('chain');
    if (error) throw error;
    return (data?.length || 0) === 1;
  }

  async releaseToken(chain: string, address: string, patch: TokenPatch) {
    await this.updateToken(chain, address, { ...patch, sync_started_at: null, lock_owner: null });
  }

  async dueTokens(now: Date, limit: number) {
    const iso = now.toISOString();
    const { data, error } = await this.sb.from('indexed_tokens')
      .select('*')
      .eq('enabled', true)
      .or(`backoff_until.is.null,backoff_until.lte.${iso}`)
      .or(`next_sync_at.lte.${iso},sync_requested_at.not.is.null`)
      .order('sync_requested_at', { ascending: false, nullsFirst: false })
      .order('next_sync_at', { ascending: true })
      .limit(Math.max(limit * 3, 30));
    if (error) throw error;
    const rows = (data || []) as TokenRow[];
    rows.sort((a, b) =>
      Number(!!b.sync_requested_at) - Number(!!a.sync_requested_at)
      || TIER_RANK[a.tier_override || a.tier] - TIER_RANK[b.tier_override || b.tier]
      || a.next_sync_at.localeCompare(b.next_sync_at));
    return rows;
  }

  async getState(chain: string, address: string) {
    const { data, error } = await this.sb.from('token_sync_state').select('version, state').eq('chain', chain).eq('address', address).maybeSingle();
    if (error) throw error;
    if (!data?.state) return null;
    const st = data.state as SyncState;
    return st.v === STATE_VERSION ? st : null; // version mismatch = rebuild from scratch
  }
  async saveState(chain: string, address: string, state: SyncState) {
    const { error } = await this.sb.from('token_sync_state')
      .upsert({ chain, address, version: state.v, state, updated_at: new Date().toISOString() }, { onConflict: 'chain,address' });
    if (error) throw error;
  }
  async deleteState(chain: string, address: string) {
    const { error } = await this.sb.from('token_sync_state').delete().eq('chain', chain).eq('address', address);
    if (error) throw error;
  }

  async getGraph(chain: string, address: string) {
    return readGraphRow(this.sb, chain, address);
  }
  async saveGraph(chain: string, address: string, graph: TokenGraph) {
    await upsertGraphRow(this.sb, chain, address, graph);
  }
  async listGraphKeys(): Promise<GraphKey[]> {
    return listGraphRows(this.sb);
  }

  async heartbeat(id: string, startedAt: string, stats: Record<string, unknown>) {
    const { error } = await this.sb.from('worker_heartbeat')
      .upsert({ id, started_at: startedAt, last_loop_at: new Date().toISOString(), stats, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
  }
  async getHeartbeat(id: string) {
    const { data, error } = await this.sb.from('worker_heartbeat').select('id, started_at, last_loop_at, stats').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as HeartbeatRow | null) || null;
  }
  async saveBudgetCounters(id: string, counters: Record<string, unknown>) {
    const cur = await this.getHeartbeat(id);
    const { error } = await this.sb.from('worker_heartbeat').upsert({
      id, started_at: cur?.started_at ?? null, last_loop_at: cur?.last_loop_at ?? null,
      stats: { ...(cur?.stats || {}), budgetCounters: counters }, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
  }

  async openAlert(kind: string, message: string, details?: Record<string, unknown>) {
    const { data, error } = await this.sb.from('worker_alerts').select('id').eq('kind', kind).is('resolved_at', null).limit(1);
    if (error) throw error;
    if (data?.length) return false;
    const { error: e2 } = await this.sb.from('worker_alerts').insert({ kind, message, details: details || null });
    if (e2) throw e2;
    return true;
  }
  async resolveAlerts(kind: string) {
    const { error } = await this.sb.from('worker_alerts').update({ resolved_at: new Date().toISOString() }).eq('kind', kind).is('resolved_at', null);
    if (error) throw error;
  }
}
