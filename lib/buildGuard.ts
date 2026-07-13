// Protects the Moralis/Helius CU budget from abuse and accidents. Graph BUILDS are
// the expensive operation (~8.2k CU per EVM token, ~200 CU per SOL token on the
// 2M CU/month plan); cached serves cost nothing and are never limited.
//
// Three independent brakes, all env-overridable:
//   1. per-IP build allowance (in-memory per instance — a brake, not a wall)
//   2. global concurrent-build cap per instance
//   3. daily build budget, derived from token_graphs.computed_at timestamps in
//      Supabase so it holds across serverless instances (in-memory fallback).
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const IP_BUILDS_PER_HOUR = num(process.env.GUARD_IP_BUILDS_PER_HOUR, 6);
const IP_BUILDS_PER_DAY = num(process.env.GUARD_IP_BUILDS_PER_DAY, 20);
const MAX_CONCURRENT_BUILDS = num(process.env.GUARD_MAX_CONCURRENT_BUILDS, 3);
const EVM_BUILDS_PER_DAY = num(process.env.GUARD_EVM_BUILDS_PER_DAY, 25);
const SOL_BUILDS_PER_DAY = num(process.env.GUARD_SOL_BUILDS_PER_DAY, 100);

// A build can never legitimately outlive the route's maxDuration — leases older
// than this are expired, so a leaked slot (crash, dev-reload edge case) self-heals
// instead of wedging the instance at "busy" forever.
const SLOT_LEASE_MS = 360_000;

interface IpWindow { hour: number[]; day: number[] }
const ipWindows: Map<string, IpWindow> =
  ((globalThis as any).__guardIpWindows ||= new Map());
const state: { leases: number[]; dayStamp: string; evmBuilds: number; solBuilds: number } =
  ((globalThis as any).__guardState2 ||= { leases: [], dayStamp: '', evmBuilds: 0, solBuilds: 0 });

const activeBuilds = () => {
  const cutoff = Date.now() - SLOT_LEASE_MS;
  state.leases = state.leases.filter(t => t > cutoff);
  return state.leases.length;
};

let sb: SupabaseClient | null | undefined;
let sbFailedAt = 0; // cooldown so a dead Supabase doesn't add 4s to every request
function supa(): SupabaseClient | null {
  if (Date.now() - sbFailedAt < 60_000) return null;
  if (sb !== undefined) return sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  sb = url && k
    ? createClient(url, k, {
        auth: { persistSession: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4000) }) },
      })
    : null;
  return sb;
}

function rollDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.dayStamp !== today) {
    state.dayStamp = today;
    state.evmBuilds = 0;
    state.solBuilds = 0;
  }
}

/** Builds completed in the last 24h, from snapshot timestamps (cross-instance). */
async function persistedBuildsToday(chain: string): Promise<number | null> {
  const client = supa();
  if (!client) return null;
  try {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    let q = client.from('token_graphs').select('*', { count: 'exact', head: true }).gte('computed_at', since);
    q = chain === 'sol' ? q.eq('chain', 'sol') : q.neq('chain', 'sol');
    const { count, error } = await q;
    if (error) throw error;
    return count ?? null;
  } catch {
    sbFailedAt = Date.now();
    return null; // fall back to the in-memory counters
  }
}

export type GuardVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * Gate a build request. `ip` limits are skipped for internal work (background
 * refresh, seeding) by passing ip = null. Background work gets only 70% of the
 * daily budget so it can never starve first-view user builds.
 */
export async function checkBuildAllowed(chain: string, ip: string | null, opts?: { background?: boolean }): Promise<GuardVerdict> {
  rollDay();

  if (activeBuilds() >= MAX_CONCURRENT_BUILDS) {
    return { allowed: false, reason: 'busy' };
  }

  if (ip) {
    const now = Date.now();
    let w = ipWindows.get(ip);
    if (!w) { w = { hour: [], day: [] }; ipWindows.set(ip, w); }
    w.hour = w.hour.filter(t => now - t < 3600_000);
    w.day = w.day.filter(t => now - t < 24 * 3600_000);
    if (w.hour.length >= IP_BUILDS_PER_HOUR || w.day.length >= IP_BUILDS_PER_DAY) {
      return { allowed: false, reason: 'ip-limit' };
    }
  }

  let cap = chain === 'sol' ? SOL_BUILDS_PER_DAY : EVM_BUILDS_PER_DAY;
  if (opts?.background) cap = Math.floor(cap * 0.7);
  // The persisted count only sees completed distinct tokens (a refresh updates one
  // row in place), so take the max of it and the in-memory attempt counter — the
  // memory side is what stops same-token refresh spam.
  const persisted = await persistedBuildsToday(chain);
  const memory = chain === 'sol' ? state.solBuilds : state.evmBuilds;
  if (Math.max(persisted ?? 0, memory) >= cap) {
    return { allowed: false, reason: 'daily-budget' };
  }

  return { allowed: true };
}

/**
 * Atomically claim a build slot at the moment the build starts: the cap check and
 * the counter increment happen in one synchronous step (no awaits), which JS
 * single-threading makes race-free within an instance. Returns false when at
 * capacity — callers must not start the build.
 */
export function tryClaimBuildSlot(chain: string): boolean {
  rollDay();
  if (activeBuilds() >= MAX_CONCURRENT_BUILDS) return false;
  state.leases.push(Date.now());
  if (chain === 'sol') state.solBuilds++;
  else state.evmBuilds++;
  return true;
}

export function recordBuildEnd() {
  state.leases.shift(); // release the oldest lease; expiry covers anything missed
}

/** Charge a build against a visitor's allowance (inline builds only). */
export function recordIpBuild(ip: string) {
  const now = Date.now();
  // Bound memory: drop IPs whose 24h windows have fully expired
  if (ipWindows.size > 5000) {
    for (const [k, v] of ipWindows) {
      if (!v.day.some(t => now - t < 24 * 3600_000)) ipWindows.delete(k);
    }
  }
  let w = ipWindows.get(ip);
  if (!w) { w = { hour: [], day: [] }; ipWindows.set(ip, w); }
  w.hour.push(now);
  w.day.push(now);
}

export function clientIp(headers: Headers): string | null {
  // Prefer Vercel's proxy-set headers — the raw x-forwarded-for first hop can be
  // client-supplied and therefore spoofed.
  const vercel = headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real;
  const fwd = headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : null;
}
