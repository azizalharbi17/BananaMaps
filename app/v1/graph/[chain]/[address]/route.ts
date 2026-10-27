// GET /v1/graph/{chain}/{address} — the full cluster graph for a token.
// data: { token, nodes[], edges[], clusters[] }; edges/clusters index into nodes.
import type { NextRequest } from 'next/server';
import { apiOptions } from '@/lib/api/respond';
import { tokenMeta } from '@/lib/api/data';
import type { GraphNode } from '@/lib/graphTypes';
import { handleSnapshotRoute, type TokenRouteContext } from '../../../_lib/handlers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function apiNode(n: GraphNode) {
  return {
    address: n.address,
    kind: n.kind,
    rank: n.rank ?? null,
    pct: n.pct,
    balance: n.balanceFormatted ?? null,
    usdValue: n.usdValue ?? null,
    label: n.label ?? null,
    labelType: n.labelType ?? null,
    cluster: n.cluster ?? null,
    degree: n.degree,
  };
}

export async function GET(req: NextRequest, ctx: TokenRouteContext) {
  return handleSnapshotRoute('graph', req, ctx, (graph, computedAt) => ({
    token: tokenMeta(graph, computedAt),
    nodes: graph.nodes.map(apiNode),
    edges: graph.edges.map(e => ({ from: e.from, to: e.to, count: e.count })),
    clusters: graph.clusters.map(c => ({ id: c.id, members: c.members, pct: c.pct })),
  }));
}

export async function OPTIONS() {
  return apiOptions();
}
