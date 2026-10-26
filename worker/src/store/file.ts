// Local JSON-file store for development and provider testing. Mirrors the
// Supabase semantics (insert-if-missing, lease claims, one open alert per kind)
// so the sync logic is exercised identically; nothing here touches the network.
import fs from 'node:fs';
import path from 'node:path';
import type { TokenGraph } from '../../../lib/graphTypes';
import type { SyncState } from '../state';
import { Store, TokenRow, TokenPatch, GraphKey, HeartbeatRow, tokenKey } from './types';

interface AlertRec { id: number; kind: string; message: string; details?: Record<string, unknown>; created_at: string; resolved_at: string | null }

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}
function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');

function definedOnly<T extends object>(r: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(r)) if (v !== undefined) (out as any)[k] = v;
  return out;
}

export class FileStore implements Store {
  readonly kind = 'file' as const;
  private registry: Record<string, TokenRow> = {};
  private alerts: AlertRec[] = [];
  constructor(private dir: string) {}

  private file(...p: string[]) { return path.join(this.dir, ...p); }
  private flushRegistry() { writeJson(this.file('registry.json'), this.registry); }
  private flushAlerts() { writeJson(this.file('alerts.json'), this.alerts); }

  async init() {
    fs.mkdirSync(this.dir, { recursive: true });
    this.registry = readJson(this.file('registry.json'), {});
    this.alerts = readJson(this.file('alerts.json'), []);
  }

  async listTokens() { return Object.values(this.registry); }
  async getToken(chain: string, address: string) { return this.registry[tokenKey(chain, address)] || null; }

  async insertMissing(rows: Array<Pick<TokenRow, 'chain' | 'address'> & TokenPatch>) {
    let n = 0;
    const now = new Date().toISOString();
    for (const r of rows) {
      const k = tokenKey(r.chain, r.address);
      if (this.registry[k]) continue;
      this.registry[k] = {
        chain: r.chain, address: r.address, symbol: null, name: null, tier: 'warm', tier_override: null, enabled: true,
        enrolled_from: 'seed', enrolled_at: now, liquidity_usd: null, volume_24h_usd: null, last_synced_cursor: null,
        last_synced_at: null, last_full_build: null, next_sync_at: now, sync_requested_at: null, last_requested_at: null,
        sync_started_at: null, lock_owner: null, sync_count: 0, consecutive_errors: 0, backoff_until: null,
        last_error: null, last_error_at: null, needs_full_build: true, updated_at: now,
        ...definedOnly(r),
      };
      n++;
    }
    if (n) this.flushRegistry();
    return n;
  }

  async updateToken(chain: string, address: string, patch: TokenPatch) {
    const row = this.registry[tokenKey(chain, address)];
    if (!row) return;
    Object.assign(row, definedOnly(patch), { updated_at: new Date().toISOString() });
    this.flushRegistry();
  }

  async claimToken(chain: string, address: string, owner: string, staleMs: number) {
    const row = this.registry[tokenKey(chain, address)];
    if (!row) return false;
    const started = row.sync_started_at ? new Date(row.sync_started_at).getTime() : 0;
    if (row.sync_started_at && Date.now() - started < staleMs) return false;
    row.sync_started_at = new Date().toISOString();
    row.lock_owner = owner;
    this.flushRegistry();
    return true;
  }

  async releaseToken(chain: string, address: string, patch: TokenPatch) {
    await this.updateToken(chain, address, { ...patch, sync_started_at: null, lock_owner: null });
  }

  async dueTokens(now: Date, limit: number) {
    const t = now.getTime();
    return Object.values(this.registry)
      .filter(r => r.enabled
        && (!r.backoff_until || new Date(r.backoff_until).getTime() <= t)
        && (r.sync_requested_at || new Date(r.next_sync_at).getTime() <= t))
      .slice(0, Math.max(limit * 3, 30));
  }

  async getState(chain: string, address: string) {
    return readJson<SyncState | null>(this.file('state', `${safe(chain)}_${safe(address)}.json`), null);
  }
  async saveState(chain: string, address: string, state: SyncState) {
    writeJson(this.file('state', `${safe(chain)}_${safe(address)}.json`), state);
  }
  async deleteState(chain: string, address: string) {
    try { fs.unlinkSync(this.file('state', `${safe(chain)}_${safe(address)}.json`)); } catch { /* absent */ }
  }

  async getGraph(chain: string, address: string) {
    const g = readJson<TokenGraph | null>(this.file('graphs', `${safe(chain)}_${safe(address)}.json`), null);
    return g ? { graph: g, computedAt: g.computedAt } : null;
  }
  async saveGraph(chain: string, address: string, graph: TokenGraph) {
    writeJson(this.file('graphs', `${safe(chain)}_${safe(address)}.json`), graph);
  }
  async listGraphKeys(): Promise<GraphKey[]> {
    const dir = this.file('graphs');
    if (!fs.existsSync(dir)) return [];
    const out: GraphKey[] = [];
    for (const f of fs.readdirSync(dir)) {
      const g = readJson<TokenGraph | null>(path.join(dir, f), null);
      if (g) out.push({ chain: g.chain, address: g.address, computedAt: g.computedAt, symbol: g.symbol, name: g.name, volume24h: g.volume24h || 0 });
    }
    return out;
  }

  async heartbeat(id: string, startedAt: string, stats: Record<string, unknown>) {
    writeJson(this.file(`heartbeat_${safe(id)}.json`), { id, started_at: startedAt, last_loop_at: new Date().toISOString(), stats });
  }
  async getHeartbeat(id: string) {
    return readJson<HeartbeatRow | null>(this.file(`heartbeat_${safe(id)}.json`), null);
  }
  async saveBudgetCounters(id: string, counters: Record<string, unknown>) {
    const f = this.file(`heartbeat_${safe(id)}.json`);
    const cur = readJson<HeartbeatRow | null>(f, null) || { id, started_at: null, last_loop_at: null, stats: {} };
    writeJson(f, { ...cur, stats: { ...(cur.stats || {}), budgetCounters: counters } });
  }

  async openAlert(kind: string, message: string, details?: Record<string, unknown>) {
    if (this.alerts.some(a => a.kind === kind && !a.resolved_at)) return false;
    this.alerts.push({ id: this.alerts.length + 1, kind, message, details, created_at: new Date().toISOString(), resolved_at: null });
    this.flushAlerts();
    return true;
  }
  async resolveAlerts(kind: string) {
    let changed = false;
    for (const a of this.alerts) if (a.kind === kind && !a.resolved_at) { a.resolved_at = new Date().toISOString(); changed = true; }
    if (changed) this.flushAlerts();
  }
}
