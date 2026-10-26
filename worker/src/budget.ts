// Provider budgets: hard daily request caps (UTC day), rolling error tracking
// with a circuit breaker per provider, and hourly call/error series for the
// health endpoint. Counters persist through the heartbeat row so a restart
// mid-day doesn't reset the day's spend.
import { AsyncLocalStorage } from 'node:async_hooks';
import { cfg } from './config';
import { log } from './log';
import { setProviderCallListener, Provider } from '../../lib/providerMeter';

export type ProviderName = Provider;

interface Counter { day: string; calls: number; errors: number }
interface MinuteBucket { minute: number; calls: number; errors: number }

const utcDay = () => new Date().toISOString().slice(0, 10);

/** Per-sync call attribution: every provider call made inside runScoped() lands in that scope's map. */
export const callScope = new AsyncLocalStorage<Map<string, number>>();
export async function runScoped<T>(fn: () => Promise<T>): Promise<{ result: T; calls: Record<string, number> }> {
  const m = new Map<string, number>();
  const result = await callScope.run(m, fn);
  return { result, calls: Object.fromEntries(m) };
}

class Budget {
  private counters = new Map<string, Counter>();
  private minutes = new Map<string, MinuteBucket[]>();
  private circuitOpenUntil = new Map<string, number>();
  private recentErrors = new Map<string, number[]>();
  private exhaustedAnnounced = new Set<string>();

  constructor() {
    setProviderCallListener(p => this.recordCall(p));
  }

  private counter(p: string): Counter {
    const day = utcDay();
    let c = this.counters.get(p);
    if (!c || c.day !== day) {
      c = { day, calls: 0, errors: 0 };
      this.counters.set(p, c);
      this.exhaustedAnnounced.delete(p);
    }
    return c;
  }

  private bucket(p: string): MinuteBucket {
    const minute = Math.floor(Date.now() / 60_000);
    let list = this.minutes.get(p);
    if (!list) { list = []; this.minutes.set(p, list); }
    let b = list[list.length - 1];
    if (!b || b.minute !== minute) {
      b = { minute, calls: 0, errors: 0 };
      list.push(b);
      // keep 24h of minute buckets
      while (list.length && list[0].minute < minute - 24 * 60) list.shift();
    }
    return b;
  }

  cap(p: string): number { return cfg.budgets[p] ?? cfg.budgets.other; }

  recordCall(p: string) {
    this.counter(p).calls++;
    this.bucket(p).calls++;
    const scope = callScope.getStore();
    if (scope) scope.set(p, (scope.get(p) || 0) + 1);
  }

  recordError(p: string) {
    this.counter(p).errors++;
    this.bucket(p).errors++;
    const now = Date.now();
    const list = (this.recentErrors.get(p) || []).filter(t => now - t < cfg.circuit.windowMs);
    list.push(now);
    this.recentErrors.set(p, list);
    if (list.length >= cfg.circuit.errors && !(this.circuitOpenUntil.get(p)! > now)) {
      this.circuitOpenUntil.set(p, now + cfg.circuit.openMs);
      log.warn('provider circuit opened', { provider: p, errorsInWindow: list.length, openForMs: cfg.circuit.openMs });
    }
  }

  recordSuccess(p: string) {
    this.recentErrors.set(p, []);
  }

  circuitOpen(p: string): boolean {
    return (this.circuitOpenUntil.get(p) || 0) > Date.now();
  }

  remaining(p: string): number {
    return Math.max(0, this.cap(p) - this.counter(p).calls);
  }

  /** Can we start work that will cost roughly `n` calls on this provider? */
  canSpend(p: string, n = 1): boolean {
    if (this.circuitOpen(p)) return false;
    const ok = this.counter(p).calls + n <= this.cap(p);
    if (!ok && !this.exhaustedAnnounced.has(p)) {
      this.exhaustedAnnounced.add(p);
      log.warn('provider daily budget exhausted', { provider: p, calls: this.counter(p).calls, cap: this.cap(p) });
    }
    return ok;
  }

  isExhausted(p: string): boolean {
    return this.counter(p).calls >= this.cap(p);
  }

  /** Window sums for the health endpoint. */
  window(p: string, minutes: number): { calls: number; errors: number } {
    const since = Math.floor(Date.now() / 60_000) - minutes;
    let calls = 0, errors = 0;
    for (const b of this.minutes.get(p) || []) if (b.minute >= since) { calls += b.calls; errors += b.errors; }
    return { calls, errors };
  }

  snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const names = new Set<string>([...Object.keys(cfg.budgets).filter(k => k !== 'other'), ...this.counters.keys()]);
    for (const p of names) {
      const c = this.counter(p);
      const h = this.window(p, 60);
      out[p] = {
        callsToday: c.calls, errorsToday: c.errors, cap: this.cap(p), remaining: this.remaining(p),
        callsLastHour: h.calls, errorsLastHour: h.errors,
        errorRateLastHour: h.calls ? Number((h.errors / h.calls).toFixed(3)) : 0,
        circuitOpenUntil: this.circuitOpen(p) ? new Date(this.circuitOpenUntil.get(p)!).toISOString() : null,
      };
    }
    return out;
  }

  /** Persisted shape (day counters only). */
  persist(): Record<string, Counter> {
    const out: Record<string, Counter> = {};
    for (const [p, c] of this.counters) out[p] = { ...c };
    return out;
  }

  restore(saved: unknown) {
    if (!saved || typeof saved !== 'object') return;
    const day = utcDay();
    for (const [p, c] of Object.entries(saved as Record<string, Counter>)) {
      if (c && c.day === day && typeof c.calls === 'number') this.counters.set(p, { day, calls: c.calls, errors: c.errors || 0 });
    }
  }
}

export const budget = new Budget();

/** Run a provider-bound step, attributing thrown errors to that provider. */
export async function withProvider<T>(p: ProviderName, fn: () => Promise<T>): Promise<T> {
  try {
    const r = await fn();
    budget.recordSuccess(p);
    return r;
  } catch (e) {
    budget.recordError(p);
    throw e;
  }
}
