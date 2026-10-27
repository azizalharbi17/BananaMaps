// GET /v1/holders/{chain}/{address} — top-150 holders with %, balances, USD value and labels.
import type { NextRequest } from 'next/server';
import { apiOptions } from '@/lib/api/respond';
import { holdersOf, tokenMeta } from '@/lib/api/data';
import { handleSnapshotRoute, type TokenRouteContext } from '../../../_lib/handlers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_HOLDERS = 150;

export async function GET(req: NextRequest, ctx: TokenRouteContext) {
  return handleSnapshotRoute('holders', req, ctx, (graph, computedAt) => ({
    token: tokenMeta(graph, computedAt),
    holders: holdersOf(graph).slice(0, MAX_HOLDERS),
  }));
}

export async function OPTIONS() {
  return apiOptions();
}
