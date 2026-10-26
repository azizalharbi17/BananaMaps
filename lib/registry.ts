// Token registry (indexed_tokens) — the contract between the Next.js app and the
// background worker (worker/). Everything here is best-effort: the app must keep
// serving maps when Supabase is unreachable or the migration hasn't been applied
// yet, so no function throws and a missing table just reads as "not registered".
import { getServiceClient, hasServiceRole } from './graphCache';

export interface RegisteredToken {
  chain: string;
  address: string;
  tier: 'hot' | 'warm' | 'cold';
  enabled: boolean;
  last_synced_at: string | null;
  last_full_build: string | null;
  next_sync_at: string | null;
  sync_requested_at: string | null;
  backoff_until: string | null;
  consecutive_errors: number;
}

export type EnrollSource = 'seed' | 'trending' | 'on-demand' | 'manual';

const HEARTBEAT_ID = 'indexer';
// How recent the worker's heartbeat must be for the app to trust it with a
// user's first view (otherwise the on-demand build path takes over).
const WORKER_ALIVE_MS = 5 * 60_000;

// Cache the missing-table verdict so a pre-migration deploy doesn't pay a failed
// query per request. Re-probed every 10 minutes.
let tableMissingUntil = 0;
const missing = () => Date.now() < tableMissingUntil;
function noteError(e: unknown) {
  const msg = e instanceof Error ? e.message : String((e as any)?.message || e);
  if (/relation .* does not exist|schema cache|PGRST205|PGRST204|42P01/i.test(msg)) {
    tableMissingUntil = Date.now() + 10 * 60_000;
  }
  console.error('[registry]', msg);
}

export async function lookupRegistered(chain: string, address: string): Promise<RegisteredToken | null> {
  const client = getServiceClient();
  if (!client || missing()) return null;
  try {
    const { data, error } = await client
      .from('indexed_tokens')
      .select('chain, address, tier, enabled, last_synced_at, last_full_build, next_sync_at, sync_requested_at, backoff_until, consecutive_errors')
      .eq('chain', chain)
      .eq('address', address)
      .maybeSingle();
    if (error) throw error;
    return (data as RegisteredToken | null) || null;
  } catch (e) {
    noteError(e);
    return null;
  }
}

/** Insert-if-absent. Existing rows are left untouched (the worker owns their state). */
export async function enrollToken(input: { chain: string; address: string; source: EnrollSource; symbol?: string; name?: string }): Promise<boolean> {
  const client = getServiceClient();
  if (!client || !hasServiceRole() || missing()) return false;
  try {
    const { error } = await client
      .from('indexed_tokens')
      .upsert(
        {
          chain: input.chain,
          address: input.address,
          symbol: input.symbol || null,
          name: input.name || null,
          enrolled_from: input.source,
          last_requested_at: input.source === 'on-demand' ? new Date().toISOString() : null,
        },
        { onConflict: 'chain,address', ignoreDuplicates: true },
      );
    if (error) throw error;
    return true;
  } catch (e) {
    noteError(e);
    return false;
  }
}

/** Ask the worker to sync this token at the front of its queue (user refresh / stale serve). */
export async function requestSync(chain: string, address: string): Promise<void> {
  const client = getServiceClient();
  if (!client || !hasServiceRole() || missing()) return;
  try {
    const now = new Date().toISOString();
    const { error } = await client
      .from('indexed_tokens')
      .update({ sync_requested_at: now, last_requested_at: now })
      .eq('chain', chain)
      .eq('address', address);
    if (error) throw error;
  } catch (e) {
    noteError(e);
  }
}

let aliveCache: { at: number; alive: boolean } | null = null;
/** Is the worker loop alive (heartbeat within the last few minutes)? Cached 30s. */
export async function workerAlive(): Promise<boolean> {
  if (aliveCache && Date.now() - aliveCache.at < 30_000) return aliveCache.alive;
  const client = getServiceClient();
  let alive = false;
  if (client && !missing()) {
    try {
      const { data, error } = await client
        .from('worker_heartbeat')
        .select('last_loop_at')
        .eq('id', HEARTBEAT_ID)
        .maybeSingle();
      if (error) throw error;
      const at = data?.last_loop_at ? new Date(data.last_loop_at).getTime() : 0;
      alive = Date.now() - at < WORKER_ALIVE_MS;
    } catch (e) {
      noteError(e);
    }
  }
  aliveCache = { at: Date.now(), alive };
  return alive;
}
