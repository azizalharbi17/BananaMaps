// Shared data model for the precomputed token holder graph.
// Built server-side by lib/graphBuilder.ts, cached in Supabase, rendered by app/app.

export type NodeKind = 'holder' | 'counterparty';

export interface GraphNode {
  address: string;
  kind: NodeKind;
  /** Rank among top holders (1-based); undefined for counterparty-only nodes. */
  rank?: number;
  /** Percent of total supply held (0 for counterparty-only nodes we didn't balance-check). */
  pct: number;
  balanceFormatted?: number;
  usdValue?: number;
  /** CEX/DEX/burn/contract label — labeled nodes are excluded from clustering. */
  label?: string;
  labelType?: 'cex' | 'dex' | 'burn' | 'contract';
  /** Connected-component id over wallet-to-wallet edges; undefined = unclustered. */
  cluster?: number;
  /** Number of graph edges touching this node (used for the 500-node cap priority). */
  degree: number;
}

export interface GraphEdge {
  /** Index into nodes[] of the sender. */
  from: number;
  /** Index into nodes[] of the receiver. */
  to: number;
  /** Number of transfers observed in this direction. */
  count: number;
}

export interface ClusterSummary {
  id: number;
  /** Node indices that belong to this cluster. */
  members: number[];
  /** Combined % of supply held by members. */
  pct: number;
}

export interface TokenGraph {
  version: number;
  chain: string;
  address: string;
  name: string;
  symbol: string;
  logo: string;
  price: number;
  priceChange24h: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: ClusterSummary[];
  holderCount: number;
  /** ISO timestamp of when this graph was computed. */
  computedAt: string;
}

export const GRAPH_VERSION = 2;
