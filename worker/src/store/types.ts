// Persistence contract. Two implementations: Supabase (production) and a local
// JSON file store (development / provider testing without touching the DB).
import type { TokenGraph } from '../../../lib/graphTypes';
import type { SyncState } from '../state';
import type { Tier } from '../config';

export interface TokenRow {
  chain: string;
  address: string;
  symbol: string | null;
  name: string | null;
  tier: Tier;
  tier_override: Tier | null;
  enabled: boolean;
  enrolled_from: string;
  enrolled_at: string;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  last_synced_cursor: string | null;
  last_synced_at: string | null;
  last_full_build: string | null;
  next_sync_at: string;
  sync_requested_at: string | null;
  last_requested_at: string | null;
  sync_started_at: string | null;
  lock_owner: string | null;
  sync_count: number;
  consecutive_errors: number;
  backoff_until: string | null;
  last_error: string | null;
  last_error_at: string | null;
  needs_full_build: boolean;
  updated_at: string;
}

export type TokenPatch = Partial<Omit<TokenRow, 'chain' | 'address'>>;

export interface GraphKey {
  chain: string;
  address: string;
  computedAt: string;
  symbol: string;
  name: string;
  volume24h: number;
}

export interface HeartbeatRow {
  id: string;
  started_at: string | null;
  last_loop_at: string | null;
  stats: Record<string, unknown> | null;
}

export interface Store {
  readonly kind: 'supabase' | 'file';
  init(): Promise<void>;

  // registry
  listTokens(): Promise<TokenRow[]>;
  getToken(chain: string, address: string): Promise<TokenRow | null>;
  /** Insert rows that don't exist yet; existing rows are untouched. Returns #inserted. */
  insertMissing(rows: Array<Pick<TokenRow, 'chain' | 'address'> & TokenPatch>): Promise<number>;
  updateToken(chain: string, address: string, patch: TokenPatch): Promise<void>;
  /** Atomic claim: succeeds only if unlocked or the lock is stale. */
  claimToken(chain: string, address: string, owner: string, staleMs: number): Promise<boolean>;
  releaseToken(chain: string, address: string, patch: TokenPatch): Promise<void>;
  /** Enabled tokens that are due (next_sync_at ≤ now or sync requested) and not backed off. */
  dueTokens(now: Date, limit: number): Promise<TokenRow[]>;

  // incremental state
  getState(chain: string, address: string): Promise<SyncState | null>;
  saveState(chain: string, address: string, state: SyncState): Promise<void>;
  deleteState(chain: string, address: string): Promise<void>;

  // graphs (token_graphs)
  getGraph(chain: string, address: string): Promise<{ graph: TokenGraph; computedAt: string } | null>;
  saveGraph(chain: string, address: string, graph: TokenGraph): Promise<void>;
  listGraphKeys(): Promise<GraphKey[]>;

  // ops
  heartbeat(id: string, startedAt: string, stats: Record<string, unknown>): Promise<void>;
  getHeartbeat(id: string): Promise<HeartbeatRow | null>;
  /** Persist provider day-counters without touching liveness (CLI commands share the loop's daily caps). */
  saveBudgetCounters(id: string, counters: Record<string, unknown>): Promise<void>;
  /** One open alert per kind: no-op when an unresolved alert of this kind exists. Returns true if created. */
  openAlert(kind: string, message: string, details?: Record<string, unknown>): Promise<boolean>;
  resolveAlerts(kind: string): Promise<void>;
}

export const tokenKey = (chain: string, address: string) => `${chain}:${address}`;
