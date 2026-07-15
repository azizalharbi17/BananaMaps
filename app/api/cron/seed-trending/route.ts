import { NextRequest, NextResponse } from 'next/server';
import { fetchTrendingChain, TRENDING_NETWORKS } from '@/lib/trending';
import { getCachedGraph } from '@/lib/graphCache';
import { MIN_COMPAT_VERSION } from '@/lib/graphTypes';
import { normAddr } from '@/lib/graphBuilder';
import { checkBuildAllowed } from '@/lib/buildGuard';
import { runBuild } from '@/lib/buildRunner';

// Daily pre-build of trending tokens (vercel.json cron) so hot coins are instant.
// Time-boxed to fit maxDuration and gated by the background budget (70% of the
// daily cap) so it can never starve first-view user builds. Builds run two at a
// time so more of the trending set lands inside the window while a third
// concurrency slot (GUARD_MAX_CONCURRENT_BUILDS=3) stays free for user builds.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// No build STARTS after this cutoff: worst observed build is ~130s, so anything
// started by then finishes before Vercel kills the function at maxDuration —
// a build cut off mid-flight is pure wasted CU (the cache write never happens).
const BUILD_START_CUTOFF_MS = 170_000;
const FRESH_MS = 24 * 3600_000;
const BUILD_CONCURRENCY = 2;
const PER_CHAIN = 4;

export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET> when the env var is set.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const lists = await Promise.all(TRENDING_NETWORKS.map(([net, chain]) => fetchTrendingChain(net, chain, PER_CHAIN)));
  // Interleave chains for fairness; dedupe by chain:address
  const tokens: { chain: string; address: string; symbol: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < PER_CHAIN; i++) {
    for (const list of lists) {
      const t = list[i];
      if (t && !seen.has(`${t.chain}:${t.address}`)) {
        seen.add(`${t.chain}:${t.address}`);
        tokens.push({ chain: t.chain, address: t.address, symbol: t.symbol });
      }
    }
  }

  const results: { token: string; chain: string; status: string }[] = [];
  // Admission (async budget check → synchronous slot/counter claim inside
  // runBuild) is serialized so two workers can't both pass the cap check at
  // cap-1 before either has claimed.
  let admission: Promise<void> = Promise.resolve();
  async function seedOne(t: { chain: string; address: string; symbol: string }) {
    try {
      const addrKey = normAddr(t.address, t.chain);
      // Freshness check first — it's a sub-second cache read, so it runs even
      // past the cutoff and keeps the run report accurate.
      const cached = await getCachedGraph(t.chain, addrKey);
      const age = cached ? Date.now() - new Date(cached.computedAt).getTime() : Infinity;
      if (cached && cached.graph.version >= MIN_COMPAT_VERSION && age < FRESH_MS) {
        results.push({ token: t.symbol, chain: t.chain, status: 'fresh' });
        return;
      }
      if (Date.now() - started > BUILD_START_CUTOFF_MS) {
        results.push({ token: t.symbol, chain: t.chain, status: 'skipped:time' });
        return;
      }
      const gate = admission.then(async (): Promise<{ skip?: string; build?: ReturnType<typeof runBuild> }> => {
        const verdict = await checkBuildAllowed(t.chain, null, { background: true });
        if (!verdict.allowed) return { skip: verdict.reason };
        return { build: runBuild(t.address, t.chain, addrKey, null) };
      });
      admission = gate.then(() => {}, () => {});
      const adm = await gate;
      if (!adm.build) {
        results.push({ token: t.symbol, chain: t.chain, status: `skipped:${adm.skip}` });
        return;
      }
      const result = await adm.build;
      results.push({ token: t.symbol, chain: t.chain, status: result ? (result.partial ? 'partial' : 'built') : 'not-found' });
    } catch (e) {
      results.push({ token: t.symbol, chain: t.chain, status: `error:${e instanceof Error ? e.message.slice(0, 60) : 'unknown'}` });
    }
  }
  // Small worker pool: single-threaded JS makes the shared cursor race-free.
  let cursor = 0;
  await Promise.all(Array.from({ length: BUILD_CONCURRENCY }, async () => {
    while (cursor < tokens.length) await seedOne(tokens[cursor++]);
  }));

  console.log('[cron/seed-trending]', JSON.stringify(results));
  return NextResponse.json({ results, elapsedMs: Date.now() - started });
}
