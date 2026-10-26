// Incremental sync state for one token — the thing the delta loop mutates and
// the graph is assembled from. Kept chain-agnostic except for the cursor.
//
// Edges live as per-holder counterparty counts (`cp[addr] = [out, in]`) rather
// than transfer lists: a holder's history is "how many times did it send to /
// receive from each address". At assembly time these expand into synthetic
// id-less transfers for lib/graphCore.buildGraph, whose sender rule (an inbound
// transfer from another *synced* holder is skipped because the sender's history
// already counts it) de-duplicates transfers that touch two tracked holders.
import type { TokenGraph } from '../../lib/graphTypes';
import type { AddrLabel, RawHolder, RawTransfer, TokenMeta } from '../../lib/graphCore';
import { normAddr } from '../../lib/graphCore';

export const STATE_VERSION = 1;

export interface HolderRec {
  address: string;
  balanceFormatted: number;
  pct: number;
  usdValue?: number;
}

export interface SolAccountCursor {
  /** Token account (ATA or other) owned by the holder for this mint. */
  address: string;
  /** Newest processed signature; null = never polled (first poll seeds it). */
  lastSig: string | null;
  /** Consecutive empty polls → poll every 2^idle syncs (capped). */
  idle: number;
  /** Sync counter value at/after which this account is polled again. */
  nextPollAt: number;
}

export interface HolderHistory {
  /** counterparty → [sent-to count, received-from count] */
  cp: Record<string, [number, number]>;
  /** False until the holder's initial history has been fetched (new holders mid-stream). */
  synced: boolean;
  /** True for labeled (cex/dex/contract/burn) holders whose own stream is deliberately not polled. */
  skipped?: boolean;
  firstSeenAt: string;
  /** Solana: watched token accounts (per-holder cursors live here). */
  accounts?: SolAccountCursor[];
}

export type Cursor =
  | { kind: 'evm'; block: number; seenAtBlock: string[] }   // Moralis token-wide stream (from_block inclusive)
  | { kind: 'rpc'; block: number }                           // eth_getLogs: next fromBlock
  | { kind: 'sol'; syncs: number };                          // per-holder cursors in hist[].accounts

export interface SyncState {
  v: number;
  chain: string;
  address: string;
  holders: HolderRec[];
  /** Token supply in formatted units (pct = balance / supply × 100). */
  supplyFormatted?: number;
  decimals?: number;
  hist: Record<string, HolderHistory>;
  /** Resolved labels for node addresses; null = checked, nothing found (not re-checked until a full build). */
  labels: Record<string, AddrLabel | null>;
  cursor: Cursor;
  meta?: TokenMeta;
  lastHoldersRefreshAt?: string;
  lastFullBuildAt?: string;
  bootstrappedFromGraph?: boolean;
  createdAt: string;
  stats: { syncs: number; lastDeltaTransfers: number; lastSyncMs: number; lastHistoryResets: number };
}

export function emptyState(chain: string, address: string, cursor: Cursor): SyncState {
  return {
    v: STATE_VERSION, chain, address: normAddr(address, chain), holders: [], hist: {}, labels: {}, cursor,
    createdAt: new Date().toISOString(),
    stats: { syncs: 0, lastDeltaTransfers: 0, lastSyncMs: 0, lastHistoryResets: 0 },
  };
}

export function newHistory(): HolderHistory {
  return { cp: {}, synced: false, firstSeenAt: new Date().toISOString() };
}

/** Count one transfer in a holder's history. */
export function bump(h: HolderHistory, counterparty: string, dir: 'out' | 'in', n = 1) {
  const e = h.cp[counterparty] || (h.cp[counterparty] = [0, 0]);
  if (dir === 'out') e[0] += n; else e[1] += n;
}

export interface ApplyOptions {
  /**
   * Per-holder stream semantics (Solana): the transfer came from THIS holder's
   * own token-account stream, so only this holder's edges AND balance move.
   * The other endpoint is updated when its own stream is polled, so each
   * tracked endpoint changes exactly once per transfer, never twice.
   */
  only?: string;
  /** Count edges (default true). Swaps update balances but are not wallet-to-wallet edges. */
  edges?: boolean;
}

/**
 * Apply one token transfer to the state: edge counts and balance deltas for the
 * tracked holders it touches. Token-wide streams (EVM/RPC) see each transfer
 * exactly once and call this without 'only'; per-account streams pass 'only'.
 */
export function applyTransfer(
  state: SyncState,
  from: string, to: string,
  valueFormatted: number,
  opts: ApplyOptions | string = {},
): boolean {
  const o: ApplyOptions = typeof opts === 'string' ? { only: opts } : opts;
  const only = o.only;
  const edges = o.edges !== false;
  if (!from || !to || from === to) return false;
  if (from === state.address || to === state.address) return false;
  let touched = false;
  const fromSide = !only || only === from;
  const toSide = !only || only === to;
  const hf = state.hist[from];
  const ht = state.hist[to];
  if (edges && hf && fromSide) { bump(hf, to, 'out'); touched = true; }
  if (edges && ht && toSide) { bump(ht, from, 'in'); touched = true; }
  if (valueFormatted > 0) {
    const bf = fromSide ? holderRef(state, from) : undefined;
    const bt = toSide ? holderRef(state, to) : undefined;
    if (bf) { bf.balanceFormatted = Math.max(0, bf.balanceFormatted - valueFormatted); touched = true; }
    if (bt) { bt.balanceFormatted += valueFormatted; touched = true; }
  }
  return touched;
}

const holderIndex = new WeakMap<SyncState, Map<string, HolderRec>>();
export function holderRef(state: SyncState, addr: string): HolderRec | undefined {
  let m = holderIndex.get(state);
  if (!m || m.size !== state.holders.length) {
    m = new Map(state.holders.map(h => [h.address, h]));
    holderIndex.set(state, m);
  }
  return m.get(addr);
}
export function invalidateHolderIndex(state: SyncState) { holderIndex.delete(state); }

/** Re-derive pct from balances (after delta application) and keep holders ranked by balance. */
export function rerankHolders(state: SyncState) {
  if (state.supplyFormatted && state.supplyFormatted > 0) {
    for (const h of state.holders) h.pct = (h.balanceFormatted / state.supplyFormatted) * 100;
  }
  state.holders.sort((a, b) => b.balanceFormatted - a.balanceFormatted);
  invalidateHolderIndex(state);
}

/** Bound per-holder counterparty maps: keep the most-connected ones. Tracked holders are never pruned (≤150, the bound still holds). */
export function pruneHistories(state: SyncState, maxPerHolder: number) {
  for (const h of Object.values(state.hist)) {
    const keys = Object.keys(h.cp);
    if (keys.length <= maxPerHolder) continue;
    const prunable = keys.filter(k => !state.hist[k]);
    const keep = Math.max(0, maxPerHolder - (keys.length - prunable.length));
    if (prunable.length <= keep) continue;
    prunable.sort((a, b) => (h.cp[b][0] + h.cp[b][1]) - (h.cp[a][0] + h.cp[a][1]));
    for (const k of prunable.slice(keep)) delete h.cp[k];
  }
}

/** Replace the tracked holder set after an authoritative top-N refresh. Returns the newly added / dropped addresses. */
export function replaceHolders(state: SyncState, fresh: RawHolder[]): { added: string[]; removed: string[] } {
  const chain = state.chain;
  const next: HolderRec[] = fresh.map(h => ({
    address: normAddr(h.address, chain), balanceFormatted: h.balanceFormatted, pct: h.pct, usdValue: h.usdValue,
  }));
  const nextSet = new Set(next.map(h => h.address));
  const added: string[] = [];
  const removed: string[] = [];
  for (const addr of Object.keys(state.hist)) if (!nextSet.has(addr)) { delete state.hist[addr]; removed.push(addr); }
  for (const h of next) if (!state.hist[h.address]) { state.hist[h.address] = newHistory(); added.push(h.address); }
  state.holders = next;
  invalidateHolderIndex(state);
  // supply from the top holder's (balance, pct) pair when the source reports percentages
  const top = next.find(h => h.pct > 0 && h.balanceFormatted > 0);
  if (top) state.supplyFormatted = top.balanceFormatted / (top.pct / 100);
  state.lastHoldersRefreshAt = new Date().toISOString();
  return { added, removed };
}

/** Load a holder's initial history from fetched transfers (full build / new holder). */
export function ingestHistory(state: SyncState, holder: string, transfers: RawTransfer[]) {
  const h = state.hist[holder] || (state.hist[holder] = newHistory());
  h.cp = {};
  const chain = state.chain;
  for (const t of transfers) {
    if (!t.from || !t.to) continue;
    const from = normAddr(t.from, chain), to = normAddr(t.to, chain);
    if (from === to || from === state.address || to === state.address) continue;
    if (from === holder) bump(h, to, 'out');
    else if (to === holder) bump(h, from, 'in');
  }
  h.synced = true;
}

/**
 * Expand histories into the id-less transfer lists lib/graphCore.buildGraph
 * expects. buildGraph's sender rule ignores an inbound transfer whose sender is
 * another synced holder, so holder→holder edges are emitted from the SENDER's
 * list only, with count = max(sender.out, receiver.in): either side may have
 * missed the transfer (a page window or pruning) while the other carries it.
 */
export function toTransfersByHolder(state: SyncState): Map<string, RawTransfer[]> {
  const out = new Map<string, RawTransfer[]>();
  const syncedHolders = Object.entries(state.hist).filter(([, h]) => h.synced && !h.skipped).map(([a]) => a);
  const syncedSet = new Set(syncedHolders);
  for (const holder of syncedHolders) {
    const h = state.hist[holder];
    const list: RawTransfer[] = [];
    // Non-holder counterparties: both directions straight from this holder's history.
    for (const [cp, [outN, inN]] of Object.entries(h.cp)) {
      if (syncedSet.has(cp)) continue;
      for (let i = 0; i < outN; i++) list.push({ from: holder, to: cp });
      for (let i = 0; i < inN; i++) list.push({ from: cp, to: holder });
    }
    // Holder→holder: emitted from the sender's list only, count = max(sender.out,
    // receiver.in), so an edge survives even if only one side still records it.
    for (const other of syncedHolders) {
      if (other === holder) continue;
      const n = Math.max(h.cp[other]?.[0] || 0, state.hist[other].cp[holder]?.[1] || 0);
      for (let i = 0; i < n; i++) list.push({ from: holder, to: other });
    }
    out.set(holder, list);
  }
  return out;
}

export function toRawHolders(state: SyncState): RawHolder[] {
  return state.holders.map(h => ({ address: h.address, balanceFormatted: h.balanceFormatted, pct: h.pct, usdValue: h.usdValue }));
}

/**
 * Seed state from an existing cached TokenGraph (registry seeding): holders with
 * balances and the surviving edge list become per-holder histories. Lossy vs a
 * full build (counterparties beyond the 500-node cap were dropped), so the token
 * is flagged for a low-priority full rebuild later.
 */
export function bootstrapFromGraph(graph: TokenGraph, cursor: Cursor): SyncState {
  const st = emptyState(graph.chain, graph.address, cursor);
  st.bootstrappedFromGraph = true;
  const holders = graph.nodes.filter(n => n.kind === 'holder');
  st.holders = holders.map(n => ({ address: n.address, balanceFormatted: n.balanceFormatted || 0, pct: n.pct, usdValue: n.usdValue }));
  const top = st.holders.find(h => h.pct > 0 && h.balanceFormatted > 0);
  if (top) st.supplyFormatted = top.balanceFormatted / (top.pct / 100);
  for (const h of st.holders) { st.hist[h.address] = newHistory(); st.hist[h.address].synced = true; }
  for (const e of graph.edges) {
    const from = graph.nodes[e.from]?.address, to = graph.nodes[e.to]?.address;
    if (!from || !to) continue;
    if (st.hist[from]) bump(st.hist[from], to, 'out', e.count);
    if (st.hist[to]) bump(st.hist[to], from, 'in', e.count);
  }
  // The on-demand build already ran the label resolver over every node of this
  // graph, so unlabeled nodes are recorded as "checked" (null) — re-resolving
  // them would cost ~15 Moralis stats calls per token for nothing. The hub
  // heuristic label is recomputed by buildGraph each time, so it is not pinned.
  for (const n of graph.nodes) {
    if (n.label === "Exchange-like (unverified)") st.labels[n.address] = null;
    else if (n.labelType) st.labels[n.address] = { label: n.label || n.labelType, labelType: n.labelType };
    else if (n.label) st.labels[n.address] = { label: n.label };
    else st.labels[n.address] = null;
  }
  st.meta = {
    name: graph.name, symbol: graph.symbol, logo: graph.logo, price: graph.price, priceChange24h: graph.priceChange24h,
    marketCap: graph.marketCap, volume24h: graph.volume24h, totalHolders: graph.totalHolders, holderCount: graph.holderCount,
  };
  st.lastHoldersRefreshAt = graph.computedAt;
  // The bootstrap counts as the build for scheduling: the periodic drift reset
  // runs FULL_REBUILD_EVERY_MS from now, not from the (possibly months-old)
  // snapshot, so seeding 200+ tokens doesn't queue 200 full builds on day one.
  st.lastFullBuildAt = new Date().toISOString();
  return st;
}

export function cursorSummary(state: SyncState): string {
  const c = state.cursor;
  if (c.kind === 'evm') return `block:${c.block}`;
  if (c.kind === 'rpc') return `block:${c.block}`;
  let accounts = 0, cursored = 0;
  for (const h of Object.values(state.hist)) for (const a of h.accounts || []) { accounts++; if (a.lastSig) cursored++; }
  return `sol:${cursored}/${accounts} accounts cursored, sync#${c.syncs}`;
}
