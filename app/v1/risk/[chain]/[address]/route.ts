// GET /v1/risk/{chain}/{address} — risk score (0-100), factors and a cluster summary.
import type { NextRequest } from 'next/server';
import { apiOptions } from '@/lib/api/respond';
import { riskOf, tokenMeta } from '@/lib/api/data';
import { handleSnapshotRoute, type TokenRouteContext } from '../../../_lib/handlers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: TokenRouteContext) {
  return handleSnapshotRoute('risk', req, ctx, (graph, computedAt) => ({
    token: tokenMeta(graph, computedAt),
    risk: riskOf(graph),
  }));
}

export async function OPTIONS() {
  return apiOptions();
}
