import { NextRequest, NextResponse } from 'next/server';
import { fetchTrendingChain, TRENDING_NETWORKS } from '@/lib/trending';
import { getCachedGraph } from '@/lib/graphCache';
import { MIN_COMPAT_VERSION } from '@/lib/graphTypes';
import { normAddr } from '@/lib/graphBuilder';
import { checkBuildAllowed } from '@/lib/buildGuard';
import { runBuild } from '@/lib/buildRunner';

// Daily pre-build of trending tokens (vercel.json cron) so hot coins are instant.
// Time-boxed to fit maxDuration and gated by the background budget (70% of the
// daily cap) so it can never starve first-view user builds.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const TIME_BUDGET_MS = 240_000;
const FRESH_MS = 24 * 3600_000;

export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET> when the env var is set.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const lists = await Promise.all(TRENDING_NETWORKS.map(([net, chain]) => fetchTrendingChain(net, chain, 3)));
  // Interleave chains for fairness; dedupe by chain:address
  const tokens: { chain: string; address: string; symbol: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 3; i++) {
    for (const list of lists) {
      const t = list[i];
      if (t && !seen.has(`${t.chain}:${t.address}`)) {
        seen.add(`${t.chain}:${t.address}`);
        tokens.push({ chain: t.chain, address: t.address, symbol: t.symbol });
      }
    }
  }

  const results: { token: string; chain: string; status: string }[] = [];
  for (const t of tokens) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      results.push({ token: t.symbol, chain: t.chain, status: 'skipped:time' });
      continue;
    }
    try {
      const addrKey = normAddr(t.address, t.chain);
      const cached = await getCachedGraph(t.chain, addrKey);
      const age = cached ? Date.now() - new Date(cached.computedAt).getTime() : Infinity;
      if (cached && cached.graph.version >= MIN_COMPAT_VERSION && age < FRESH_MS) {
        results.push({ token: t.symbol, chain: t.chain, status: 'fresh' });
        continue;
      }
      const verdict = await checkBuildAllowed(t.chain, null, { background: true });
      if (!verdict.allowed) {
        results.push({ token: t.symbol, chain: t.chain, status: `skipped:${verdict.reason}` });
        continue;
      }
      const result = await runBuild(t.address, t.chain, addrKey, null);
      results.push({ token: t.symbol, chain: t.chain, status: result ? (result.partial ? 'partial' : 'built') : 'not-found' });
    } catch (e) {
      results.push({ token: t.symbol, chain: t.chain, status: `error:${e instanceof Error ? e.message.slice(0, 60) : 'unknown'}` });
    }
  }

  console.log('[cron/seed-trending]', JSON.stringify(results));
  return NextResponse.json({ results, elapsedMs: Date.now() - started });
}
