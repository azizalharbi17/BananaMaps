import { NextRequest, NextResponse, after } from 'next/server';
import { resolveTokenInput, normAddr, CHAIN_LABEL, UpstreamError, NotIndexedError } from '@/lib/graphBuilder';
import { getCachedGraph } from '@/lib/graphCache';
import { MIN_COMPAT_VERSION, TokenGraph } from '@/lib/graphTypes';
import { checkBuildAllowed, clientIp } from '@/lib/buildGuard';
import { runBuild, isBuildInFlight, BuildSlotsBusy } from '@/lib/buildRunner';
import { KNOWN_TOKENS } from '@/lib/constants';
import { lookupRegistered, requestSync, workerAlive } from '@/lib/registry';

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

const guardDeniedMsg = (reason: string) => reason === 'ip-limit'
  ? 'Rate limit reached — try again in a little while'
  : 'High demand right now — new token maps are temporarily paused, try again soon';

// Terminal outcome of a background (wait=0) build that produced no cache entry —
// not-found, upstream failure, or a partial result. Lets polls report the failure
// within one cycle instead of spinning to the client-side timeout. In-memory, so
// a poll routed to another instance just keeps polling; the client timeout is the
// cross-instance backstop.
interface BuildOutcome { at: number; error?: string; status?: number; graph?: TokenGraph }
const lastBuildOutcome: Map<string, BuildOutcome> =
  ((globalThis as any).__graphBuildOutcomes ||= new Map());
const OUTCOME_TTL_MS = 10 * 60_000;

// Polls re-run token resolution every 20s; pinning the first successful
// resolution keeps the {address, chain} stable under the poll loop and spares
// DexScreener the repeat lookups. Consulted for polls only — fresh requests
// keep resolving so a new pool listing can still win.
const resolvedInputs: Map<string, { address: string; chain: string; at: number }> =
  ((globalThis as any).__graphResolvedInputs ||= new Map());
const RESOLVE_TTL_MS = 10 * 60_000;

// Registered tokens are kept fresh by the background worker (worker/). A refresh
// click or a stale serve just flags the row for a priority sync; this throttle
// keeps poll loops from writing that flag on every probe.
const lastSyncRequest: Map<string, number> =
  ((globalThis as any).__graphSyncRequests ||= new Map());
const SYNC_REQUEST_THROTTLE_MS = 60_000;
async function flagForWorker(flightKey: string, chain: string, addrKey: string) {
  const last = lastSyncRequest.get(flightKey) || 0;
  if (Date.now() - last < SYNC_REQUEST_THROTTLE_MS) return;
  lastSyncRequest.set(flightKey, Date.now());
  if (lastSyncRequest.size > 1000) {
    for (const [k, v] of lastSyncRequest) if (Date.now() - v >= SYNC_REQUEST_THROTTLE_MS) lastSyncRequest.delete(k);
  }
  await requestSync(chain, addrKey);
}

function recordOutcome(flightKey: string, outcome: BuildOutcome) {
  // Bound memory: partial graphs are large, so sweep expired entries as we write
  if (lastBuildOutcome.size > 50) {
    for (const [k, v] of lastBuildOutcome) {
      if (Date.now() - v.at >= OUTCOME_TTL_MS) lastBuildOutcome.delete(k);
    }
  }
  lastBuildOutcome.set(flightKey, outcome);
}

function buildErrorOutcome(e: unknown): BuildOutcome {
  if (e instanceof NotIndexedError) return { at: Date.now(), error: e.message, status: 404 };
  if (e instanceof BuildSlotsBusy) return { at: Date.now(), error: 'High demand right now — try again in a minute', status: 429 };
  const error = e instanceof UpstreamError
    ? 'Data source temporarily unavailable — try again shortly'
    : 'Failed to build graph';
  return { at: Date.now(), error, status: 502 };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || '';
  const chainHint = searchParams.get('chain') || 'eth';
  const refresh = searchParams.get('refresh') === '1';
  // Non-blocking first build (embed iframes can't hold a 1-3 min request open):
  // wait=0 starts the build in the background and returns 202; poll=1 is a pure
  // cache probe that never starts work, so polls are safe on any instance.
  const nowait = searchParams.get('wait') === '0';
  const poll = searchParams.get('poll') === '1';
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
      const inputKey = `${token.trim().toLowerCase()}|${chainHint}`;
      const pinned = poll ? resolvedInputs.get(inputKey) : undefined;
      if (pinned && Date.now() - pinned.at < RESOLVE_TTL_MS) {
        ({ address, chain } = pinned);
      } else {
        const resolved = await resolveTokenInput(token, chainHint);
        if (!resolved) {
          return NextResponse.json(
            { error: `Token not found on ${CHAIN_LABEL[chainHint] || chainHint}` },
            { status: 404 },
          );
        }
        ({ address, chain } = resolved);
        if (resolvedInputs.size > 500) {
          for (const [k, v] of resolvedInputs) {
            if (Date.now() - v.at >= RESOLVE_TTL_MS) resolvedInputs.delete(k);
          }
        }
        resolvedInputs.set(inputKey, { address, chain, at: Date.now() });
      }
    }
    const addrKey = normAddr(address, chain);
    const flightKey = `${chain}:${addrKey}`;

    // Registry lookup rides alongside the cache read (one PK read each). A
    // registered token is the worker's responsibility: this route serves the DB
    // snapshot and never spends Vercel/provider budget rebuilding it.
    const [cached, registered] = await Promise.all([getCachedGraph(chain, addrKey), lookupRegistered(chain, addrKey)]);
    const age = cached ? Date.now() - new Date(cached.computedAt).getTime() : Infinity;
    // The worker is only trusted with a token when it can actually act on it:
    // enabled, not backed off after errors, and alive (fresh heartbeat). For a
    // token with no snapshot yet, a sync the worker already deferred (never
    // synced, pushed into the future) or that errored also falls through to the
    // on-demand build so a user is never left polling a build nobody will run.
    const backedOff = !!registered?.backoff_until && new Date(registered.backoff_until).getTime() > Date.now();
    const registeredActive = !!registered?.enabled && !backedOff;
    const indexed = registeredActive && (await workerAlive());
    const workerDeferred = !!registered && !registered.last_synced_at && (
      (registered.consecutive_errors || 0) > 0
      || (!!registered.next_sync_at && new Date(registered.next_sync_at).getTime() > Date.now() + 60_000)
    );
    // Note: production Supabase has only ever held v3+ snapshots, so a sub-compat
    // row is a dev-cache curiosity — still served in stale paths, never fresh ones.
    const fresh = cached && cached.graph.version >= MIN_COMPAT_VERSION && age < STALE_MS;
    const refreshCoolingDown = refresh && cached && age < REFRESH_COOLDOWN_MS;

    // 2. Fresh snapshot (or a refresh inside the cooldown) → serve as-is
    if (cached && ((!refresh && fresh) || (refreshCoolingDown && !indexed))) {
      return NextResponse.json({ graph: cached.graph, cachedAt: cached.computedAt, fromCache: true, indexed });
    }

    // 2b. Registered token with a snapshot: refresh clicks and stale serves both
    //     queue a priority sync for the worker and hand back the current snapshot.
    //     The client polls briefly for the newer computedAt (see AppClient). A
    //     snapshot the worker has let go very stale (2× the stale window) falls
    //     through to the app's own revalidation as a safety net.
    if (cached && indexed && age < 2 * STALE_MS) {
      after(() => flagForWorker(flightKey, chain, addrKey));
      return NextResponse.json({
        graph: cached.graph, cachedAt: cached.computedAt, fromCache: true, indexed: true,
        revalidating: true, stale: !fresh, etaSeconds: 90,
      });
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

    // 4. Nothing cached yet. Poll probes answer from cache and recorded build
    //    outcomes alone — never start a build, so the 20s embed polling loop costs
    //    nothing regardless of which instance it lands on.
    if (!refresh && poll) {
      const outcome = lastBuildOutcome.get(flightKey);
      if (outcome && Date.now() - outcome.at < OUTCOME_TTL_MS && !isBuildInFlight(chain, addrKey)) {
        if (outcome.graph) {
          // Partial build: served once like the inline path would, never cached
          return NextResponse.json({ graph: outcome.graph, cachedAt: outcome.graph.computedAt, fromCache: false, partial: true });
        }
        return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      }
      return NextResponse.json(
        { building: true, inFlight: isBuildInFlight(chain, addrKey), indexed },
        { status: 202 },
      );
    }

    // 4b. Registered but not built yet (trending enrollment, or the on-demand
    //     build's cache write hasn't landed). While the worker is alive, hand the
    //     first build to it instead of spending a Vercel build slot; the client's
    //     existing 202 polling picks the snapshot up. A dead worker falls through
    //     to the on-demand path below so users are never stranded.
    if (indexed && !refresh && !workerDeferred) {
      after(() => flagForWorker(flightKey, chain, addrKey));
      return NextResponse.json({ building: true, etaSeconds: 120, indexed: true }, { status: 202 });
    }

    // 5. Non-blocking first build: same guard + IP charge as an inline build, but
    //    the response returns immediately and after() keeps the instance alive
    //    until the build settles. The client polls until the snapshot lands (or a
    //    recorded terminal outcome tells it to stop).
    if (!refresh && nowait) {
      if (!isBuildInFlight(chain, addrKey)) {
        const verdict = await checkBuildAllowed(chain, ip);
        if (!verdict.allowed) {
          return NextResponse.json({ error: guardDeniedMsg(verdict.reason) }, { status: 429 });
        }
        lastBuildOutcome.delete(flightKey);
        const bg = runBuild(address, chain, addrKey, ip)
          .then(result => {
            if (!result) {
              recordOutcome(flightKey, { at: Date.now(), error: `Token not found on ${CHAIN_LABEL[chain] || chain}`, status: 404 });
            } else if (result.partial) {
              recordOutcome(flightKey, { at: Date.now(), graph: result.graph });
            }
            // Full builds need no outcome — the cache write is the signal.
          })
          .catch(e => {
            console.error('[api/graph] background first build failed:', e instanceof Error ? e.message : e);
            recordOutcome(flightKey, buildErrorOutcome(e));
          });
        after(() => bg);
      }
      return NextResponse.json({ building: true, etaSeconds: 120 }, { status: 202 });
    }

    // 6. Inline build (first-ever view or explicit refresh) — rate-limited per IP
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
        return NextResponse.json({ error: guardDeniedMsg(verdict.reason) }, { status: 429 });
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
