// Environment-driven configuration. Loaded once at startup; every knob has a
// sane default so the worker runs with only the Supabase + provider keys set.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type Tier = 'hot' | 'warm' | 'cold';
export type Family = 'evm' | 'sol' | 'robinhood';

function loadEnv() {
  // Explicit file wins; otherwise worker/.env (prod), then the repo's .env.local (dev).
  // Layout-aware: src/ when run through tsx, dist/worker/src/ when compiled.
  const compiled = __dirname.includes(`${path.sep}dist${path.sep}`);
  const workerDir = path.resolve(__dirname, compiled ? '../../..' : '..');
  const candidates = [
    process.env.ENV_FILE,
    path.join(workerDir, '.env'),
    path.join(workerDir, '..', '.env.local'),
  ].filter((p): p is string => !!p);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { (process as any).loadEnvFile(p); } catch { /* older Node: ignore */ }
      process.env.__ENV_FILE_LOADED = p;
      return;
    }
  }
}
loadEnv();

const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const num = (k: string, d: number) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n >= 0 && process.env[k] !== undefined && process.env[k] !== '' ? n : d;
};
const bool = (k: string, d: boolean) => {
  const v = process.env[k];
  if (v === undefined || v === '') return d;
  return !/^(0|false|no|off)$/i.test(v.trim());
};

const H = 3600_000;
const store = (env('STORE', 'supabase') === 'file' ? 'file' : 'supabase') as 'supabase' | 'file';

export const cfg = {
  envFile: process.env.__ENV_FILE_LOADED || '(none)',
  instanceId: env('WORKER_ID') || `${os.hostname()}:${process.pid}`,
  store,
  graphSink: ((env('GRAPH_SINK') || store) === 'file' ? 'file' : 'supabase') as 'supabase' | 'file',
  dataDir: path.resolve(env('DATA_DIR') || path.resolve(__dirname, __dirname.includes(`${path.sep}dist${path.sep}`) ? '../../../.data' : '../.data')),

  loopTickMs: num('LOOP_TICK_MS', 15_000),
  maxConcurrent: num('MAX_CONCURRENT_SYNCS', 3),
  familyConcurrency: {
    evm: num('CONCURRENCY_EVM', 2),
    sol: num('CONCURRENCY_SOL', 1),
    robinhood: num('CONCURRENCY_ROBINHOOD', 1),
  } as Record<Family, number>,

  intervals: {
    hot: num('INTERVAL_HOT_MS', 10 * 60_000),
    warm: num('INTERVAL_WARM_MS', H),
    cold: num('INTERVAL_COLD_MS', 24 * H),
  } as Record<Tier, number>,
  holdersRefresh: {
    hot: num('HOLDERS_REFRESH_HOT_MS', H),
    warm: num('HOLDERS_REFRESH_WARM_MS', 6 * H),
    cold: num('HOLDERS_REFRESH_COLD_MS', 24 * H),
  } as Record<Tier, number>,
  intervalMultiplier(chain: string): number {
    const n = Number(process.env[`INTERVAL_MULT_${chain.toUpperCase()}`]);
    return Number.isFinite(n) && n > 0 ? n : 1;
  },
  fullRebuildEveryMs: num('FULL_REBUILD_EVERY_MS', 30 * 24 * H),
  maxFullBuildsPerHour: num('MAX_FULL_BUILDS_PER_HOUR', 6),
  trending: { everyMs: num('TRENDING_EVERY_MS', 6 * H), perChain: num('TRENDING_PER_CHAIN', 4) },

  tiers: {
    hotVol: num('TIER_HOT_VOLUME_USD', 1_000_000),
    hotLiq: num('TIER_HOT_LIQ_USD', 500_000),
    warmVol: num('TIER_WARM_VOLUME_USD', 50_000),
    warmLiq: num('TIER_WARM_LIQ_USD', 50_000),
  },

  budgets: {
    moralis: num('BUDGET_MORALIS_PER_DAY', 800),
    helius: num('BUDGET_HELIUS_PER_DAY', 20_000),
    vybe: num('BUDGET_VYBE_PER_DAY', 1_500),
    solscan: num('BUDGET_SOLSCAN_PER_DAY', 500),
    blockscout: num('BUDGET_BLOCKSCOUT_PER_DAY', 2_000),
    'robinhood-rpc': num('BUDGET_ROBINHOOD_RPC_PER_DAY', 20_000),
    publicnode: num('BUDGET_PUBLICNODE_PER_DAY', 2_000),
    dexscreener: num('BUDGET_DEXSCREENER_PER_DAY', 5_000),
    geckoterminal: num('BUDGET_GECKOTERMINAL_PER_DAY', 200),
    other: num('BUDGET_OTHER_PER_DAY', 10_000),
  } as Record<string, number>,

  backoff: { baseMs: num('BACKOFF_BASE_MS', 10 * 60_000), maxMs: num('BACKOFF_MAX_MS', 24 * H) },
  circuit: { errors: num('CIRCUIT_ERRORS', 5), windowMs: num('CIRCUIT_WINDOW_MS', 5 * 60_000), openMs: num('CIRCUIT_OPEN_MS', 5 * 60_000) },
  stallAlertMs: num('STALL_ALERT_MS', 30 * 60_000),
  claimStaleMs: num('CLAIM_STALE_MS', 20 * 60_000),

  maxDeltaPages: num('MAX_DELTA_PAGES', 10),
  maxCpPerHolder: num('MAX_CP_PER_HOLDER', 300),
  solMaxSigPages: num('SOL_MAX_SIG_PAGES', 3),
  solIdleBackoffMax: num('SOL_IDLE_BACKOFF_MAX', 12),
  rhHistoryBlocks: num('RH_HISTORY_BLOCKS', 2_000_000),
  skipLabeledHistory: bool('SKIP_LABELED_HISTORY', true),

  healthPort: num('HEALTH_PORT', 8787),
  /** Bind address for /health. Loopback by default: the firewall is not the only control. */
  healthHost: env('HEALTH_HOST', '127.0.0.1'),
  /** Dead-man's-switch URL (UptimeRobot Heartbeat / Healthchecks.io) pinged after every completed loop. */
  heartbeatUrl: env('HEARTBEAT_URL', ''),
  logFormat: env('LOG_FORMAT', 'json') === 'pretty' ? 'pretty' : 'json',
};

export function familyOf(chain: string): Family {
  if (chain === 'sol') return 'sol';
  if (chain === 'robinhood') return 'robinhood';
  return 'evm';
}

export function requireEnv(keys: string[]): string[] {
  return keys.filter(k => !process.env[k]);
}
