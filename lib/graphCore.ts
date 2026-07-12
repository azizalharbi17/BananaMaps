// Pure graph assembly: holders + per-holder transfer lists → TokenGraph.
// No I/O here; fetchers live in lib/graphBuilder.ts. Keeping this pure makes it unit-testable.
import { TokenGraph, GraphNode, GraphEdge, ClusterSummary, GRAPH_VERSION } from './graphTypes';

export interface RawHolder {
  address: string;
  balanceFormatted: number;
  pct: number;
  usdValue?: number;
}

export interface RawTransfer {
  from: string;
  to: string;
  /** Unique transfer identity (tx hash + log index / signature) for cross-history dedup. */
  id?: string;
}

export interface AddrLabel {
  label: string;
  /** Only these types are excluded from clustering. */
  labelType?: 'cex' | 'dex' | 'burn' | 'contract';
}

export interface TokenMeta {
  name: string;
  symbol: string;
  logo: string;
  price: number;
  priceChange24h: number;
  holderCount?: number;
}

const MAX_NODES = 500;

/** EVM addresses compare case-insensitively; Solana base58 is case-sensitive. */
export function normAddr(addr: string, chain: string): string {
  return chain === 'sol' ? addr : addr.toLowerCase();
}

export function buildGraph(
  chain: string,
  address: string,
  meta: TokenMeta,
  holders: RawHolder[],
  transfersByHolder: Map<string, RawTransfer[]>,
  labels: Map<string, AddrLabel>,
  computedAt: string,
): TokenGraph {
  const tokenAddr = normAddr(address, chain);
  const holderSet = new Map<string, RawHolder>();
  for (const h of holders) holderSet.set(normAddr(h.address, chain), h);

  // 1. Directed edge counts between normalized addresses, from all holders' transfer histories.
  const edgeCount = new Map<string, number>(); // "from|to" → count
  const degree = new Map<string, number>();    // address → # distinct neighbors (for the cap)
  const neighbors = new Map<string, Set<string>>();
  const bump = (a: string, b: string) => {
    let s = neighbors.get(a);
    if (!s) { s = new Set(); neighbors.set(a, s); }
    if (!s.has(b)) { s.add(b); degree.set(a, (degree.get(a) || 0) + 1); }
  };

  const fetchedHolders = new Set<string>();
  for (const holder of transfersByHolder.keys()) fetchedHolders.add(normAddr(holder, chain));
  // A transfer between two fetched holders appears in both wallets' histories.
  // Dedup by transfer identity when the source provides one; otherwise fall back
  // to counting only from the sender's history.
  const seenTransfers = new Set<string>();

  for (const [holder, transfers] of transfersByHolder) {
    const hNorm = normAddr(holder, chain);
    for (const t of transfers) {
      if (!t.from || !t.to) continue; // mints/burns can have empty endpoints on SOL
      const from = normAddr(t.from, chain);
      const to = normAddr(t.to, chain);
      if (from === to) continue;
      if (from === tokenAddr || to === tokenAddr) continue;
      // Only edges that involve the holder whose history we queried (defensive)
      if (from !== hNorm && to !== hNorm) continue;
      if (t.id) {
        const idKey = `${t.id}|${from}|${to}`;
        if (seenTransfers.has(idKey)) continue;
        seenTransfers.add(idKey);
      } else if (from !== hNorm && fetchedHolders.has(from)) {
        continue;
      }
      const key = `${from}|${to}`;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      bump(from, to);
      bump(to, from);
    }
  }

  // 2. Node set: all top holders + counterparties by degree, capped at MAX_NODES.
  const counterparties: string[] = [];
  for (const addr of neighbors.keys()) {
    if (!holderSet.has(addr)) counterparties.push(addr);
  }
  counterparties.sort((a, b) => (degree.get(b) || 0) - (degree.get(a) || 0));
  const cpBudget = Math.max(0, MAX_NODES - holderSet.size);
  const keptCp = new Set(counterparties.slice(0, cpBudget));

  const nodes: GraphNode[] = [];
  const idxOf = new Map<string, number>();
  const addNode = (n: GraphNode) => { idxOf.set(n.address, nodes.length); nodes.push(n); };

  let rank = 1;
  for (const [addr, h] of holderSet) {
    const lb = labels.get(addr);
    addNode({
      address: addr,
      kind: 'holder',
      rank: rank++,
      pct: h.pct,
      balanceFormatted: h.balanceFormatted,
      usdValue: h.usdValue,
      label: lb?.label,
      labelType: lb?.labelType,
      degree: degree.get(addr) || 0,
    });
  }
  // Unlabeled counterparty wallets that many distinct top holders all transact with
  // behave like CEX deposit/sweep wallets. Label them so they can't bridge unrelated
  // holders into one false mega-cluster (the hardcoded exchange lists are incomplete,
  // especially on Solana where there is no API label source).
  const HUB_HOLDER_NEIGHBORS = 6;
  for (const addr of keptCp) {
    let lb = labels.get(addr);
    if (!lb?.labelType) {
      let holderNeighbors = 0;
      for (const nb of neighbors.get(addr) || []) {
        if (holderSet.has(nb)) holderNeighbors++;
        if (holderNeighbors >= HUB_HOLDER_NEIGHBORS) break;
      }
      if (holderNeighbors >= HUB_HOLDER_NEIGHBORS) lb = { label: lb?.label || 'Exchange-like (unverified)', labelType: 'cex' };
    }
    addNode({
      address: addr,
      kind: 'counterparty',
      pct: 0,
      label: lb?.label,
      labelType: lb?.labelType,
      degree: degree.get(addr) || 0,
    });
  }

  // 3. Edges between kept nodes, deduped per direction.
  const edges: GraphEdge[] = [];
  for (const [key, count] of edgeCount) {
    const [from, to] = key.split('|');
    const fi = idxOf.get(from), ti = idxOf.get(to);
    if (fi === undefined || ti === undefined) continue;
    edges.push({ from: fi, to: ti, count });
  }

  // 4. Clusters = connected components over wallet-to-wallet edges.
  //    CEX / DEX / burn / contract nodes never join or bridge a cluster.
  const n = nodes.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const clusterable = (i: number) => !nodes[i].labelType;

  for (const e of edges) {
    if (clusterable(e.from) && clusterable(e.to)) union(e.from, e.to);
  }

  // Components with ≥2 members become clusters, ordered by combined pct desc.
  const compMembers = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (!clusterable(i)) continue;
    const root = find(i);
    let m = compMembers.get(root);
    if (!m) { m = []; compMembers.set(root, m); }
    m.push(i);
  }
  const comps = [...compMembers.values()].filter(m => m.length >= 2);
  const withPct = comps.map(members => ({
    members,
    pct: members.reduce((s, i) => s + nodes[i].pct, 0),
  }));
  withPct.sort((a, b) => b.pct - a.pct);

  const clusters: ClusterSummary[] = withPct.map((c, id) => {
    for (const i of c.members) nodes[i].cluster = id;
    return { id, members: c.members, pct: c.pct };
  });

  return {
    version: GRAPH_VERSION,
    chain,
    address: tokenAddr,
    name: meta.name,
    symbol: meta.symbol,
    logo: meta.logo,
    price: meta.price,
    priceChange24h: meta.priceChange24h,
    nodes,
    edges,
    clusters,
    holderCount: meta.holderCount || holders.length,
    computedAt,
  };
}
