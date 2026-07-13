import { NextRequest, NextResponse, after } from 'next/server';
import { resolveTokenInput, normAddr, CHAIN_LABEL, UpstreamError, NotIndexedError } from '@/lib/graphBuilder';
import { getCachedGraph } from '@/lib/graphCache';
import { MIN_COMPAT_VERSION } from '@/lib/graphTypes';
import { checkBuildAllowed, clientIp } from '@/lib/buildGuard';
import { runBuild, isBuildInFlight, BuildSlotsBusy } from '@/lib/buildRunner';
import { KNOWN_TOKENS } from '@/lib/constants';

// Full builds fetch ~150 wallet histories; background refreshes need the same window.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Snapshots older than this are served immediately and refreshed after the response.
const STALE_MS = 24 * 3600_000;
// Explicit refresh clicks within this window just get the current snapshot —
// stops refresh-spam from burning the CU budget on one token.
const REFRESH_COOLDOWN_MS = 30 * 60_000;
// Minimum spacing between background revalidation attempts per token, so a token
// whose rebuilds keep failing (flaky upstream, partial results) can't burn CU all day.
const REVALIDATE_RETRY_MS = 30 * 60_000;

const lastRevalidateAttempt: Map<string, number> =
  ((globalThis as any).__graphRevalAttempts ||= new Map());

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || '';
  const chainHint = searchParams.get('chain') || 'eth';
  const refresh = searchParams.get('refresh') === '1';
  const ip = clientIp(req.headers);

  if (!token.trim()) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  try {
    // 1. Resolve input → { address, chain }
    let address: string, chain: string;
    const known = KNOWN_TOKENS[token.toUpperCase().trim()];
    if (known) {
      address = known.address;
      chain = known.chain;
    } else {
      const resolved = await resolveTokenInput(token, chainHint);
      if (!resolved) {
        return NextResponse.json(
          { error: `Token not found on ${CHAIN_LABEL[chainHint] || chainHint}` },
          { status: 404 },
        );
      }
      address = resolved.address;
      chain = resolved.chain;
    }
    const addrKey = normAddr(address, chain);
    const flightKey = `${chain}:${addrKey}`;

    const cached = await getCachedGraph(chain, addrKey);
    const age = cached ? Date.now() - new Date(cached.computedAt).getTime() : Infinity;
    // Note: production Supabase has only ever held v3+ snapshots, so a sub-compat
    // row is a dev-cache curiosity — still served in stale paths, never fresh ones.
    const fresh = cached && cached.graph.version >= MIN_COMPAT_VERSION && age < STALE_MS;
    const refreshCoolingDown = refresh && cached && age < REFRESH_COOLDOWN_MS;

    // 2. Fresh snapshot (or a refresh inside the cooldown) → serve as-is
    if (cached && ((!refresh && fresh) || refreshCoolingDown)) {
      return NextResponse.json({ graph: cached.graph, cachedAt: cached.computedAt, fromCache: true });
    }

    // 3. Stale / outdated-version snapshot → serve instantly, revalidate after the
    //    response when the budget allows. Guard + cooldown checks run inside after()
    //    so the response never waits on them.
    if (!refresh && cached) {
      after(async () => {
        try {
          const lastAttempt = lastRevalidateAttempt.get(flightKey) || 0;
          if (Date.now() - lastAttempt < REVALIDATE_RETRY_MS) return;
          if (isBuildInFlight(chain, addrKey)) return; // already rebuilding
          const verdict = await checkBuildAllowed(chain, null, { background: true });
          if (!verdict.allowed) return;
          lastRevalidateAttempt.set(flightKey, Date.now());
          await runBuild(address, chain, addrKey, null);
        } catch (e) {
          console.error('[api/graph] background revalidate failed:', e instanceof Error ? e.message : e);
        }
      });
      return NextResponse.json({ graph: cached.graph, cachedAt: cached.computedAt, fromCache: true, revalidating: true });
    }

    // 4. Inline build (first-ever view or explicit refresh) — rate-limited per IP
    //    and against the daily CU budget. Joining an existing flight skips the guard
    //    (it consumes nothing new).
    const joining = isBuildInFlight(chain, addrKey);
    if (!joining) {
      const verdict = await checkBuildAllowed(chain, ip);
      if (!verdict.allowed) {
        if (cached) {
          // Over budget but we have SOMETHING — stale beats an error.
          return NextResponse.json({ graph: cached.graph, cachedAt: cached.computedAt, fromCache: true, stale: true });
        }
        const msg = verdict.reason === 'ip-limit'
          ? 'Rate limit reached — try again in a little while'
          : 'High demand right now — new token maps are temporarily paused, try again soon';
        return NextResponse.json({ error: msg }, { status: 429 });
      }
    }
    try {
      const result = await runBuild(address, chain, addrKey, joining ? null : ip);
      if (!result) {
        return NextResponse.json(
          { error: `Token not found on ${CHAIN_LABEL[chain] || chain}` },
          { status: 404 },
        );
      }
      return NextResponse.json({ graph: result.graph, cachedAt: result.graph.computedAt, fromCache: false, partial: result.partial });
    } catch (e) {
      // Build failed (rate limits, quota, outage, all slots busy) — a stale
      // snapshot beats an error.
      if (cached) {
        console.error('[api/graph] build failed, serving stale snapshot:', e instanceof Error ? e.message : e);
        return NextResponse.json({ graph: cached.graph, cachedAt: cached.computedAt, fromCache: true, stale: true });
      }
      if (e instanceof BuildSlotsBusy) {
        return NextResponse.json({ error: 'High demand right now — try again in a minute' }, { status: 429 });
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof NotIndexedError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    console.error('[api/graph]', e);
    const msg = e instanceof UpstreamError
      ? 'Data source temporarily unavailable — try again shortly'
      : 'Failed to build graph';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
