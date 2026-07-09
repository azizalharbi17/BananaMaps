import { NextRequest, NextResponse } from 'next/server';
import { computeTokenGraph, resolveTokenInput, normAddr, CHAIN_LABEL, UpstreamError, ComputeResult } from '@/lib/graphBuilder';
import { getCachedGraph, setCachedGraph } from '@/lib/graphCache';
import { GRAPH_VERSION } from '@/lib/graphTypes';
import { KNOWN_TOKENS } from '@/lib/constants';

// Full builds fetch ~150 wallet histories; allow the route to run long.
export const maxDuration = 300;

// Coalesce concurrent builds of the same token — a second request for an uncached
// token awaits the in-flight build instead of starting its own 150-wallet fetch.
// Pinned to globalThis so dev-mode module reloads don't lose in-flight entries.
const inFlight: Map<string, Promise<ComputeResult | null>> =
  ((globalThis as any).__graphInFlight ||= new Map());

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || '';
  const chainHint = searchParams.get('chain') || 'eth';
  const refresh = searchParams.get('refresh') === '1';

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

    // 2. Serve from snapshot cache unless a refresh was requested
    const cached = await getCachedGraph(chain, addrKey);
    // Snapshots from older graph semantics are recomputed, not served (unless recompute fails).
    if (!refresh && cached && cached.graph.version === GRAPH_VERSION) {
      return NextResponse.json({ graph: cached.graph, cachedAt: cached.computedAt, fromCache: true });
    }

    try {
      // 3. Compute fresh (API-heavy: ~150 holder histories with batching + delays)
      const flightKey = `${chain}:${addrKey}`;
      let promise = inFlight.get(flightKey);
      if (!promise) {
        promise = computeTokenGraph(address, chain).finally(() => inFlight.delete(flightKey));
        inFlight.set(flightKey, promise);
      }
      const result = await promise;
      if (!result) {
        return NextResponse.json(
          { error: `Token not found on ${CHAIN_LABEL[chain] || chain}` },
          { status: 404 },
        );
      }
      // Partial builds (many transfer fetches failed) are served but never cached,
      // so a degraded snapshot can't get stuck as the permanent view of a token.
      if (!result.partial) {
        await setCachedGraph(chain, addrKey, result.graph);
      }
      return NextResponse.json({ graph: result.graph, cachedAt: result.graph.computedAt, fromCache: false, partial: result.partial });
    } catch (e) {
      // Recompute failed (rate limits, quota, outage) — a stale snapshot beats an error.
      if (cached) {
        console.error('[api/graph] recompute failed, serving stale snapshot:', e instanceof Error ? e.message : e);
        return NextResponse.json({ graph: cached.graph, cachedAt: cached.computedAt, fromCache: true, stale: true });
      }
      throw e;
    }
  } catch (e) {
    console.error('[api/graph]', e);
    const msg = e instanceof UpstreamError
      ? 'Data source temporarily unavailable — try again shortly'
      : 'Failed to build graph';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
