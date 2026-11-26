// Display-time shaping of a TokenGraph ("visual v2").
//
// The stored graph (lib/graphCore.buildGraph, cached in Supabase, served by the
// API) keeps every counterparty wallet up to the 500-node cap. Drawing all of
// them turns each holder into a hairy star of one-off recipients. This pure
// transform is applied in the client (and the OG card) right before rendering:
//
//   1. Counterparties survive only when they BRIDGE ≥2 top holders — that is
//      the evidence a cluster rests on. One-off spokes are folded away.
//   2. Bridges are ranked by how many holders they connect; the ones a cluster
//      needs to stay connected are kept first, then the rest up to a cap, so a
//      mega-cluster never turns into a pollen cloud.
//   3. A cluster is only a cluster when it has ≥2 top holders. A holder whose
//      "cluster" was itself plus its own one-off recipients goes back to being
//      an unclustered holder (navy on the map, a plain row in the sidebar).
//
// Nothing is recomputed from chain data and nothing is stored: the API payload
// and the cache are untouched, and the raw graph stays available for the
// per-wallet "transfers with" panel. Pure and synchronous; safe to memoize.
import type { TokenGraph, GraphNode, GraphEdge, ClusterSummary } from './graphTypes';

export interface ViewOptions {
  /** Keep a counterparty only if it transacted with at least this many top holders. */
  bridgeMin: number;
  /** Cap on unlabeled counterparties drawn. Connectivity-critical bridges are kept first. */
  maxSatellites: number;
}

export const DEFAULT_VIEW: ViewOptions = { bridgeMin: 2, maxSatellites: 48 };

export interface ViewStats {
  /** Counterparty nodes folded away. */
  droppedCounterparties: number;
  /** Stored clusters dissolved because they held a single top holder. */
  dissolvedClusters: number;
}

/**
 * Build the graph that is actually drawn. Returns a NEW TokenGraph (the input is
 * never mutated) whose node indices, edges and cluster ids are self-consistent.
 */
export function toViewGraph(graph: TokenGraph, opts: ViewOptions = DEFAULT_VIEW): TokenGraph {
  return shape(graph, opts).graph;
}

export function viewStats(graph: TokenGraph, opts: ViewOptions = DEFAULT_VIEW): ViewStats {
  return shape(graph, opts).stats;
}

function shape(graph: TokenGraph, opts: ViewOptions): { graph: TokenGraph; stats: ViewStats } {
  const { nodes, edges, clusters } = graph;
  const isHolder = (i: number) => nodes[i].kind === 'holder';

  // Which top holders each counterparty touched, and how much traffic it carried.
  const holderNb = new Map<number, Set<number>>();
  const cpWeight = new Map<number, number>();
  for (const e of edges) {
    const pairs: [number, number][] = [];
    if (isHolder(e.from) && !isHolder(e.to)) pairs.push([e.from, e.to]);
    if (isHolder(e.to) && !isHolder(e.from)) pairs.push([e.to, e.from]);
    for (const [h, cp] of pairs) {
      let s = holderNb.get(cp);
      if (!s) { s = new Set(); holderNb.set(cp, s); }
      s.add(h);
      cpWeight.set(cp, (cpWeight.get(cp) || 0) + e.count);
    }
  }
  const bridges = [...holderNb.entries()]
    .filter(([, hs]) => hs.size >= opts.bridgeMin)
    .sort((a, b) => (b[1].size - a[1].size) || ((cpWeight.get(b[0]) || 0) - (cpWeight.get(a[0]) || 0)))
    .map(([cp]) => cp);

  // Clusters worth the name: ≥2 top holders.
  const keptClusters = clusters.filter(c => c.members.filter(isHolder).length >= 2);
  const keptClusterIds = new Set(keptClusters.map(c => c.id));

  // Phase 1 — connectivity. Every kept cluster must stay visibly connected: a
  // capped mega-cluster must not draw as two same-color blobs with no link, and
  // a holder must not keep a cluster color while sitting alone.
  //
  // Union holders through their direct edges, then walk bridges in rank order
  // and keep any that joins two still-separate parts of a kept cluster.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) { const nx = parent.get(x)!; parent.set(x, r); x = nx; }
    return r;
  };
  // b's root attaches under a's root, so a's root survives the merge.
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  // Labeled wallets (CEX / DEX / burn / contract) never carry a cluster, exactly
  // as in graphCore — a path through an exchange is not evidence of a link.
  const clusterable = (i: number) => !nodes[i].labelType;
  nodes.forEach((n, i) => { if (n.kind === 'holder') parent.set(i, i); });
  for (const e of edges) if (isHolder(e.from) && isHolder(e.to) && clusterable(e.from) && clusterable(e.to)) union(e.from, e.to);

  const keep = new Set<number>();
  for (const cp of bridges) {
    const n = nodes[cp];
    if (!clusterable(cp) || n.cluster === undefined || !keptClusterIds.has(n.cluster)) continue;
    const hs = [...holderNb.get(cp)!].filter(clusterable);
    const roots = new Set<number>();
    for (const h of hs) roots.add(find(h));
    if (roots.size >= 2) {
      keep.add(cp);
      for (const h of hs.slice(1)) union(hs[0], h);
    }
  }

  // Holders can also be tied to their cluster through CHAINS of non-holder
  // wallets (worker-built graphs keep the histories of wallets that have since
  // left the top 150, so counterparty↔counterparty edges exist). For each holder
  // still cut off from its cluster's main component, keep the shortest chain of
  // unlabeled wallets that reaches it — the same paths graphCore clustered over.
  const adj = new Map<number, number[]>();
  for (const e of edges) {
    if (!clusterable(e.from) || !clusterable(e.to)) continue;
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
  }
  for (const c of keptClusters) {
    const holders = c.members.filter(isHolder).sort((a, b) => nodes[b].pct - nodes[a].pct);
    const top = holders[0];
    for (const h of holders) {
      if (find(h) === find(top)) continue;
      // BFS inside this cluster from h to any holder already in the main component.
      const prev = new Map<number, number>([[h, -1]]);
      const queue = [h];
      let hit = -1;
      while (queue.length && hit < 0) {
        const x = queue.shift()!;
        for (const y of adj.get(x) || []) {
          if (prev.has(y) || nodes[y].cluster !== c.id) continue;
          prev.set(y, x);
          if (isHolder(y) && find(y) === find(top)) { hit = y; break; }
          queue.push(y);
        }
      }
      if (hit < 0) continue; // no unlabeled path — the stored cluster itself was not connected this way
      for (let x = hit; x !== -1; x = prev.get(x)!) {
        if (isHolder(x)) union(top, x);
        else keep.add(x);
      }
    }
  }

  // Phase 2 — fill by rank. Labeled counterparties (exchange-like hubs, DEX
  // pools…) start hidden in the UI, so they don't count against the clutter cap.
  let unlabeledKept = [...keep].filter(i => !nodes[i].labelType).length;
  for (const cp of bridges) {
    if (keep.has(cp)) continue;
    if (nodes[cp].labelType) { keep.add(cp); continue; }
    if (unlabeledKept >= opts.maxSatellites) continue;
    keep.add(cp);
    unlabeledKept++;
  }

  // Rebuild nodes: holders in stored (rank) order, then kept counterparties.
  const newIdx = new Map<number, number>();
  const outNodes: GraphNode[] = [];
  let dropped = 0;
  nodes.forEach((n, i) => {
    if (n.kind === 'holder' || keep.has(i)) {
      newIdx.set(i, outNodes.length);
      outNodes.push({ ...n, cluster: undefined });
    } else {
      dropped++;
    }
  });

  const outEdges: GraphEdge[] = [];
  for (const e of edges) {
    const a = newIdx.get(e.from), b = newIdx.get(e.to);
    if (a === undefined || b === undefined) continue;
    outEdges.push({ from: a, to: b, count: e.count });
  }

  // Kept clusters are a subsequence of the stored, pct-sorted list, so renumbering
  // in order keeps "Cluster 1" the biggest.
  const outClusters: ClusterSummary[] = keptClusters.map((c, id) => {
    const members = c.members.map(i => newIdx.get(i)).filter((i): i is number => i !== undefined);
    for (const i of members) outNodes[i].cluster = id;
    return { id, members, pct: members.reduce((s, i) => s + outNodes[i].pct, 0) };
  });

  return {
    graph: { ...graph, nodes: outNodes, edges: outEdges, clusters: outClusters },
    stats: { droppedCounterparties: dropped, dissolvedClusters: clusters.length - keptClusters.length },
  };
}
