// The scheduler: every tick, pick due tokens by priority (requested → hot →
// warm → cold), respect global/per-family concurrency and provider budgets,
// run syncs concurrently, heartbeat, and watch for stalls. Never throws out of
// a tick — a bad tick is logged and the next one runs.
import { cfg, familyOf, Family } from './config';
import { log, errMsg } from './log';
import { budget } from './budget';
import type { Store, TokenRow } from './store';
import type { GraphRepo } from './graphs';
import { syncToken, SyncOutcome, SyncContext } from './sync';
import { seedFromGraphs, enrollTrending } from './registry';
import { startHealthServer } from './health';
import { tokenKey } from './store';
import { deltaProvider } from './fullBuild';

const HEARTBEAT_ID = 'indexer';
const HEARTBEAT_EVERY_MS = 60_000;
const TOKEN_SUMMARY_EVERY_MS = 5 * 60_000;

interface RecentSync { at: number; chain: string; address: string; ok: boolean; mode: string; ms: number; deltaTransfers: number; calls: Record<string, number>; error?: string }

export class Worker implements SyncContext {
  readonly instanceId = cfg.instanceId;
  readonly startedAt = new Date().toISOString();
  lastLoopAt = 0;
  loopCount = 0;
  private stopping = false;
  private inFlight = new Map<string, { row: TokenRow; startedAt: number; promise: Promise<SyncOutcome> }>();
  private recent: RecentSync[] = [];
  private fullBuildTimes: number[] = [];
  private lastHeartbeatAt = 0;
  private lastTrendingAt = 0;
  private lastTokenSummaryAt = 0;
  private tokenSummary: Record<string, unknown> = {};
  private lastDueCount = 0;
  private stallAlerted = false;
  private budgetAlertDay = '';
  private timer: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;

  constructor(public store: Store, public graphs: GraphRepo) {}

  fullBuildsThisHour() {
    const cutoff = Date.now() - 3600_000;
    this.fullBuildTimes = this.fullBuildTimes.filter(t => t > cutoff);
    return this.fullBuildTimes.length;
  }
  noteFullBuild() { this.fullBuildTimes.push(Date.now()); }

  // ---------- lifecycle ----------

  async start() {
    log.info('worker starting', { instance: this.instanceId, store: this.store.kind, graphSink: this.graphs.kind, dryRun: this.graphs.dryRun, envFile: cfg.envFile });
    startHealthServer(cfg.healthPort, { status: () => this.status(), tokens: () => this.tokensReport() });
    try {
      const hb = await this.store.getHeartbeat(HEARTBEAT_ID);
      budget.restore((hb?.stats as any)?.budgetCounters);
    } catch (e) { log.warn('could not restore budget counters', { error: errMsg(e) }); }
    await this.safe('seed', () => seedFromGraphs(this.store, this.graphs));
    await this.safe('trending', async () => { await enrollTrending(this.store); this.lastTrendingAt = Date.now(); });
    this.watchdog = setInterval(() => void this.checkStall(), 60_000);
    this.scheduleTick(0);
  }

  async stop() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.inFlight.size) {
      log.info('waiting for in-flight syncs', { count: this.inFlight.size });
      await Promise.race([
        Promise.allSettled([...this.inFlight.values()].map(f => f.promise)),
        new Promise(r => setTimeout(r, 90_000)),
      ]);
    }
    for (const [, f] of this.inFlight) {
      try { await this.store.releaseToken(f.row.chain, f.row.address, {}); } catch { /* best effort */ }
    }
    await this.safe('final heartbeat', () => this.heartbeat(true));
  }

  private scheduleTick(delay: number) {
    if (this.stopping) return;
    this.timer = setTimeout(() => void this.tick().finally(() => this.scheduleTick(cfg.loopTickMs)), delay);
  }

  private async safe(label: string, fn: () => Promise<unknown>) {
    try { await fn(); } catch (e) { log.error(`${label} failed`, { error: errMsg(e) }); }
  }

  // ---------- one tick ----------

  async tick(): Promise<void> {
    const t0 = Date.now();
    try {
      if (Date.now() - this.lastTrendingAt >= cfg.trending.everyMs) {
        this.lastTrendingAt = Date.now();
        await this.safe('trending', () => enrollTrending(this.store));
      }
      await this.dispatch();
      if (Date.now() - this.lastHeartbeatAt >= HEARTBEAT_EVERY_MS) await this.safe('heartbeat', () => this.heartbeat());
      if (Date.now() - this.lastTokenSummaryAt >= TOKEN_SUMMARY_EVERY_MS) await this.safe('token summary', () => this.refreshTokenSummary());
      await this.budgetAlerts();
      this.loopCount++;
      this.lastLoopAt = Date.now();
      if (this.stallAlerted) {
        this.stallAlerted = false;
        await this.safe('resolve stall alert', () => this.store.resolveAlerts('loop_stalled'));
      }
    } catch (e) {
      log.error('tick failed', { error: errMsg(e), ms: Date.now() - t0 });
    }
  }

  /** Start syncs for due tokens within concurrency + budget limits. */
  private async dispatch() {
    const free = cfg.maxConcurrent - this.inFlight.size;
    if (free <= 0) return;
    const due = await this.store.dueTokens(new Date(), free);
    this.lastDueCount = due.length;
    const familyLoad: Record<Family, number> = { evm: 0, sol: 0, robinhood: 0 };
    for (const f of this.inFlight.values()) familyLoad[familyOf(f.row.chain)]++;
    let started = 0;
    for (const row of due) {
      if (started >= free) break;
      const key = tokenKey(row.chain, row.address);
      if (this.inFlight.has(key)) continue;
      const fam = familyOf(row.chain);
      if (familyLoad[fam] >= cfg.familyConcurrency[fam]) continue;
      const p = deltaProvider(row.chain);
      if (!budget.canSpend(p, 2)) {
        // Provider exhausted or circuit open: push the row back 15 min so it leaves
        // the head of the due window and other chains keep getting dispatched.
        void this.store.updateToken(row.chain, row.address, {
          next_sync_at: new Date(Date.now() + 15 * 60_000).toISOString(), sync_requested_at: null,
        }).catch(e => log.warn('could not defer budget-blocked token', { chain: row.chain, address: row.address, error: errMsg(e) }));
        continue;
      }
      familyLoad[fam]++;
      started++;
      this.startSync(row);
    }
  }

  private startSync(row: TokenRow) {
    const key = tokenKey(row.chain, row.address);
    const promise = syncToken(this, row)
      .then(outcome => { this.record(outcome); return outcome; })
      .catch(e => {
        const outcome: SyncOutcome = { chain: row.chain, address: row.address, mode: 'incremental', ok: false, ms: 0, deltaTransfers: 0, calls: {}, error: errMsg(e) };
        this.record(outcome);
        return outcome;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, { row, startedAt: Date.now(), promise });
  }

  private record(o: SyncOutcome) {
    const cutoff = Date.now() - 24 * 3600_000;
    this.recent = this.recent.filter(r => r.at > cutoff);
    if (o.mode === 'skipped') {
      log.info('sync skipped', { chain: o.chain, address: o.address, reason: o.skipReason, nextSyncAt: o.nextSyncAt });
      return;
    }
    this.recent.push({ at: Date.now(), chain: o.chain, address: o.address, ok: o.ok, mode: o.mode, ms: o.ms, deltaTransfers: o.deltaTransfers, calls: o.calls, error: o.error });
    const fields: Record<string, unknown> = {
      chain: o.chain, address: o.address, symbol: o.symbol, mode: o.mode, ms: o.ms, deltaTransfers: o.deltaTransfers, calls: o.calls,
      tier: o.tier, cursor: o.cursor, nextSyncAt: o.nextSyncAt,
    };
    if (o.graph) Object.assign(fields, { nodes: o.graph.nodes, edges: o.graph.edges, clusters: o.graph.clusters });
    if (o.newHolders) fields.newHolders = o.newHolders;
    if (o.holdersRefreshed) fields.holdersRefreshed = true;
    if (o.truncated) fields.truncated = true;
    if (o.ok) log.info('sync ok', fields);
    else log.warn('sync error', { ...fields, error: o.error });
  }

  // ---------- ops ----------

  private async heartbeat(final = false) {
    this.lastHeartbeatAt = Date.now();
    await this.store.heartbeat(HEARTBEAT_ID, this.startedAt, { ...this.stats(), budgetCounters: budget.persist(), stopping: final });
  }

  private async checkStall() {
    const since = this.lastLoopAt || new Date(this.startedAt).getTime();
    if (Date.now() - since < cfg.stallAlertMs) return;
    if (this.stallAlerted) return;
    this.stallAlerted = true;
    log.error('loop stalled', { lastLoopAt: new Date(since).toISOString(), inFlight: [...this.inFlight.keys()] });
    await this.safe('stall alert', () => this.store.openAlert('loop_stalled', `worker loop has not completed for ${Math.round((Date.now() - since) / 60_000)} min`, {
      instance: this.instanceId, lastLoopAt: new Date(since).toISOString(), inFlight: [...this.inFlight.keys()],
    }));
  }

  private async budgetAlerts() {
    const day = new Date().toISOString().slice(0, 10);
    if (this.budgetAlertDay && this.budgetAlertDay !== day) {
      await this.safe('resolve budget alerts', () => this.store.resolveAlerts('provider_budget_exhausted'));
    }
    this.budgetAlertDay = day;
    const exhausted = Object.keys(cfg.budgets).filter(p => p !== 'other' && budget.isExhausted(p));
    if (exhausted.length) {
      await this.safe('budget alert', () => this.store.openAlert('provider_budget_exhausted', `daily cap reached: ${exhausted.join(', ')}`, { providers: exhausted, day }));
    }
  }

  private async refreshTokenSummary() {
    this.lastTokenSummaryAt = Date.now();
    const rows = await this.store.listTokens();
    const now = Date.now();
    const byTier: Record<string, number> = {};
    const byChain: Record<string, number> = {};
    let backedOff = 0, disabled = 0, neverSynced = 0, needsFull = 0;
    for (const r of rows) {
      byTier[r.tier_override || r.tier] = (byTier[r.tier_override || r.tier] || 0) + 1;
      byChain[r.chain] = (byChain[r.chain] || 0) + 1;
      if (!r.enabled) disabled++;
      if (r.backoff_until && new Date(r.backoff_until).getTime() > now) backedOff++;
      if (!r.last_synced_at) neverSynced++;
      if (r.needs_full_build) needsFull++;
    }
    this.tokenSummary = { total: rows.length, byTier, byChain, backedOff, disabled, neverSynced, needsFullBuild: needsFull };
  }

  stats(): Record<string, unknown> {
    const now = Date.now();
    const hour = this.recent.filter(r => r.at > now - 3600_000);
    const day = this.recent;
    return {
      instance: this.instanceId,
      startedAt: this.startedAt,
      lastLoopAt: this.lastLoopAt ? new Date(this.lastLoopAt).toISOString() : null,
      lastLoopAgeSec: this.lastLoopAt ? Math.round((now - this.lastLoopAt) / 1000) : null,
      loopCount: this.loopCount,
      store: this.store.kind,
      graphSink: this.graphs.kind,
      dryRun: this.graphs.dryRun,
      inFlight: [...this.inFlight.values()].map(f => ({ chain: f.row.chain, address: f.row.address, symbol: f.row.symbol, forMs: now - f.startedAt })),
      due: this.lastDueCount,
      tokens: this.tokenSummary,
      syncs: {
        lastHour: hour.filter(r => r.ok).length,
        errorsLastHour: hour.filter(r => !r.ok).length,
        last24h: day.filter(r => r.ok).length,
        errorsLast24h: day.filter(r => !r.ok).length,
        fullBuildsLastHour: this.fullBuildsThisHour(),
        avgMsLastHour: hour.length ? Math.round(hour.reduce((s, r) => s + r.ms, 0) / hour.length) : 0,
        deltaTransfersLastHour: hour.reduce((s, r) => s + r.deltaTransfers, 0),
        recentErrors: day.filter(r => !r.ok).slice(-10).map(r => ({ at: new Date(r.at).toISOString(), chain: r.chain, address: r.address, error: r.error })),
      },
      providers: budget.snapshot(),
    };
  }

  status(): { ok: boolean; body: Record<string, unknown> } {
    const since = this.lastLoopAt || new Date(this.startedAt).getTime();
    const stalled = Date.now() - since >= cfg.stallAlertMs;
    return { ok: !stalled && !this.stopping, body: { ok: !stalled && !this.stopping, stalled, ...this.stats() } };
  }

  async tokensReport(): Promise<Record<string, unknown>> {
    const rows = await this.store.listTokens();
    return {
      count: rows.length,
      tokens: rows.map(r => ({
        chain: r.chain, address: r.address, symbol: r.symbol, tier: r.tier_override || r.tier, enabled: r.enabled,
        lastSyncedAt: r.last_synced_at, nextSyncAt: r.next_sync_at, cursor: r.last_synced_cursor, syncCount: r.sync_count,
        errors: r.consecutive_errors, backoffUntil: r.backoff_until, lastError: r.last_error, needsFullBuild: r.needs_full_build,
        lastFullBuild: r.last_full_build, enrolledFrom: r.enrolled_from,
      })),
    };
  }
}
