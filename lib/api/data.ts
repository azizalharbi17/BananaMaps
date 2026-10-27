// Read models for the public API. Everything is served from the cached
// snapshots the app already keeps (token_graphs, wallet_labels); the API never
// starts a build. A token without a snapshot answers 404 not_indexed with the
// app link that will build it.
import { getWalletLabels } from '../graphCache';
import { serviceDb } from '../serverDb';
import { getExchangeInfo } from '../exchanges';
import { calculateRugScore } from '../rugScore';
import type { TokenGraph, GraphNode } from '../graphTypes';

export const API_CHAINS = ['eth', 'bsc', 'base', 'sol', 'robinhood'] as const;
export type ApiChain = typeof API_CHAINS[number];
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isApiChain(chain: string): chain is ApiChain {
  return (API_CHAINS as readonly string[]).includes(chain);
}

/** Validate + normalize a chain/address pair. Returns an error message or the normalized address. */
export function normalizeAddress(chain: string, address: string): { ok: true; address: string } | { ok: false; message: string } {
  if (!isApiChain(chain)) return { ok: false, message: `Unknown chain "${chain}". Use one of: ${API_CHAINS.join(', ')}.` };
  const a = (address || '').trim();
  if (chain === 'sol') {
    if (!BASE58_RE.test(a)) return { ok: false, message: 'Solana addresses are base58 strings of 32 to 44 characters.' };
    return { ok: true, address: a };
  }
  if (!EVM_ADDR_RE.test(a)) return { ok: false, message: 'EVM addresses are 0x followed by 40 hex characters.' };
  return { ok: true, address: a.toLowerCase() };
}

export const appUrl = (chain: string, address: string) => `https://www.bananamaps.io/app?token=${encodeURIComponent(address)}&chain=${encodeURIComponent(chain)}`;

/**
 * Snapshot read for the API. Unlike the app's cache helper this does not swallow
 * store errors: a failed read throws (→ 500 server_error) instead of answering
 * 404 not_indexed for a token that is indexed.
 */
export async function loadGraph(chain: string, address: string): Promise<{ graph: TokenGraph; computedAt: string } | null> {
  const sb = serviceDb();
  if (!sb) throw new Error('snapshot store unavailable');
  const { data, error } = await sb.from('token_graphs').select('graph, computed_at').eq('chain', chain).eq('address', address).maybeSingle();
  if (error) throw new Error(`snapshot read failed: ${error.message}`);
  return data?.graph ? { graph: data.graph as TokenGraph, computedAt: data.computed_at as string } : null;
}

export interface ApiHolder {
  rank: number;
  address: string;
  pct: number;
  balance: number | null;
  usdValue: number | null;
  label: string | null;
  labelType: GraphNode['labelType'] | null;
  cluster: number | null;
}

export function holdersOf(graph: TokenGraph): ApiHolder[] {
  return graph.nodes
    .filter(n => n.kind === 'holder')
    .sort((a, b) => (a.rank || 999) - (b.rank || 999))
    .map(n => ({
      rank: n.rank || 0,
      address: n.address,
      pct: n.pct,
      balance: n.balanceFormatted ?? null,
      usdValue: n.usdValue ?? null,
      label: n.label ?? null,
      labelType: n.labelType ?? null,
      cluster: n.cluster ?? null,
    }));
}

export function tokenMeta(graph: TokenGraph, computedAt: string) {
  return {
    chain: graph.chain,
    address: graph.address,
    name: graph.name,
    symbol: graph.symbol,
    logo: graph.logo || null,
    price: graph.price || null,
    priceChange24h: graph.priceChange24h ?? null,
    marketCap: graph.marketCap ?? null,
    volume24h: graph.volume24h ?? null,
    totalHolders: graph.totalHolders ?? null,
    holdersMapped: graph.holderCount,
    computedAt,
  };
}

export function riskOf(graph: TokenGraph) {
  const holders = graph.nodes.filter(n => n.kind === 'holder');
  const meaningfulClusters = graph.clusters.filter(c => c.members.filter(i => graph.nodes[i].kind === 'holder').length >= 2).length;
  const score = calculateRugScore(
    holders.map(h => ({ pct: h.pct, cluster: h.cluster, address: h.address, isLabeledExchange: !!h.labelType && h.labelType !== 'contract' })),
    meaningfulClusters,
    graph.chain,
  );
  const top10 = holders.filter(h => (h.rank || 999) <= 10).reduce((s, h) => s + h.pct, 0);
  const clusters = graph.clusters.map(c => ({
    id: c.id,
    wallets: c.members.length,
    holders: c.members.filter(i => graph.nodes[i].kind === 'holder').length,
    pct: c.pct,
    members: c.members.map(i => graph.nodes[i].address),
  }));
  return {
    score: score.score,
    label: score.label,
    factors: score.factors.map(f => ({ name: f.name, score: f.score, weight: f.weight, detail: f.detail })),
    top10Pct: Number(top10.toFixed(4)),
    /** Every connected component (incl. holder + counterparty pairs). */
    clusterCount: graph.clusters.length,
    /** Clusters holding ≥2 top holders — the number the "Cluster Activity" factor scores. */
    meaningfulClusterCount: meaningfulClusters,
    clusters,
  };
}

export interface WalletLabel {
  address: string;
  label: string | null;
  labelType: 'cex' | 'dex' | 'burn' | 'contract' | null;
  source: 'curated' | 'resolved' | 'pattern' | null;
}

/** Label for one wallet: curated list → resolved cache (wallet_labels) → burn-address pattern. */
export async function labelOf(chain: string, address: string): Promise<WalletLabel> {
  const known = getExchangeInfo(address, chain);
  if (known) return { address, label: known.name, labelType: known.type ?? null, source: 'curated' };
  const cached = await getWalletLabels(chain, [address]);
  const row = cached.get(address);
  if (row) {
    const t = row.type === 'amm' ? 'dex' : row.type;
    return { address, label: row.name, labelType: (['cex', 'dex', 'burn', 'contract'] as const).includes(t as any) ? (t as WalletLabel['labelType']) : null, source: 'resolved' };
  }
  const burn = chain === 'sol' ? /^1nc1nerator/ : /^0x(dead|0{12,})/i;
  if (burn.test(address)) return { address, label: 'Burn Address', labelType: 'burn', source: 'pattern' };
  return { address, label: null, labelType: null, source: null };
}
