// Shared plumbing for the public API v1 routes (app/v1/**).
//
// Every token route runs the same pipeline, in this order:
//   1. validate chain + address      → 400 bad_request   (before any metering)
//   2. authorizeApiRequest(req)      → 401/403/429       (meters the call)
//   3. load the cached snapshot      → 404 not_indexed   (the API never builds)
//   4. respond with apiOk(data, meta, rate/quota headers)
// Nothing here ever reads or logs the Authorization header; auth.ts owns the key.
import type { NextRequest } from 'next/server';
import { apiError, apiOk, DOCS_URL } from '@/lib/api/respond';
import { authorizeApiRequest } from '@/lib/api/auth';
import { API_CHAINS, appUrl, loadGraph, normalizeAddress } from '@/lib/api/data';
import type { TokenGraph } from '@/lib/graphTypes';

export const API_VERSION = 'v1';
export const API_BASE = 'https://www.bananamaps.io/v1';

/** Route params for /v1/<resource>/[chain]/[address]. Next 16 hands them over as a Promise. */
export type TokenRouteContext = { params: Promise<{ chain: string; address: string }> };

export const ENDPOINTS = [
  { method: 'GET', path: '/v1/graph/{chain}/{address}', description: 'Full cluster graph for a token: nodes, edges and clusters.' },
  { method: 'GET', path: '/v1/holders/{chain}/{address}', description: 'Top-150 holders with supply %, balances, USD value and labels.' },
  { method: 'GET', path: '/v1/labels/{chain}/{wallet}', description: 'CEX / DEX / burn / contract label for one wallet.' },
  { method: 'GET', path: '/v1/risk/{chain}/{address}', description: 'Risk score (0-100) with factors and a cluster summary.' },
] as const;

export const ENDPOINT_LIST = ENDPOINTS.map(e => `${e.method} ${e.path}`).join(', ');

/** Whole seconds since the snapshot was computed; null when the timestamp is unreadable. */
export function snapshotAgeSeconds(computedAt: string, now = Date.now()): number | null {
  const t = new Date(computedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 1000));
}

export function snapshotMeta(chain: string, address: string, computedAt: string) {
  return { chain, address, computedAt, snapshotAgeSeconds: snapshotAgeSeconds(computedAt) };
}

/** Uniform 500 for unexpected failures. Logs only the route name and the error message. */
export function serverError(route: string, err: unknown) {
  console.error(`[v1] ${route} failed:`, err instanceof Error ? err.message : String(err));
  return apiError('server_error', 'Something went wrong on our side. Try again shortly; if it keeps failing, contact support.');
}

/**
 * Run a token route: validate → authorize → load the snapshot → build the payload.
 * `build` receives the cached graph and returns the `data` half of the response.
 */
export async function handleSnapshotRoute(
  route: string,
  req: NextRequest,
  ctx: TokenRouteContext,
  build: (graph: TokenGraph, computedAt: string) => unknown,
) {
  try {
    const { chain, address } = await ctx.params;
    const norm = normalizeAddress(chain, address);
    if (!norm.ok) return apiError('bad_request', norm.message);

    const authed = await authorizeApiRequest(req);
    if ('response' in authed) return authed.response;

    const snap = await loadGraph(chain, norm.address);
    if (!snap) {
      return apiError(
        'not_indexed',
        `No snapshot for this token yet. Open it in the app to build one: ${appUrl(chain, norm.address)} (then it becomes available here).`,
        authed.headers,
      );
    }

    return apiOk(build(snap.graph, snap.computedAt), snapshotMeta(chain, norm.address, snap.computedAt), authed.headers);
  } catch (err) {
    return serverError(route, err);
  }
}

/** Payload for GET /v1 (no auth): what exists and where the docs are. */
export function indexPayload() {
  return {
    version: API_VERSION,
    name: 'BananaMaps API',
    docs: DOCS_URL,
    baseUrl: API_BASE,
    auth: 'Authorization: Bearer bm_live_… (free key at https://www.bananamaps.io/developers)',
    chains: [...API_CHAINS],
    endpoints: ENDPOINTS.map(e => ({ ...e })),
  };
}
