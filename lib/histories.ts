// Per-holder counterparty counts → the id-less transfer lists lib/graphCore.buildGraph
// expects. Shared by the worker's sync state and the Robinhood log replay so both
// expand histories with identical semantics.
//
// buildGraph's sender rule ignores an inbound transfer whose sender is another
// fetched holder (that holder's own list already carries it), so holder→holder
// edges are emitted from the SENDER's list only, with count = max(sender.out,
// receiver.in): either side may have lost the transfer to a page window or to
// pruning while the other still records it.
import type { RawTransfer } from './graphCore';

/** counterparty → [sent-to count, received-from count] */
export type CpCounts = Record<string, [number, number]>;

/**
 * Edge weight cap per (holder, counterparty, direction). A pool that traded
 * 100k times with one wallet would otherwise expand into 100k objects per
 * assembly; past this count the rendered edge is indistinguishable anyway.
 */
export const MAX_EDGE_COUNT = 1000;

export function expandHistories(cpByHolder: Map<string, CpCounts>): Map<string, RawTransfer[]> {
  const out = new Map<string, RawTransfer[]>();
  const holders = [...cpByHolder.keys()];
  const holderSet = new Set(holders);
  for (const holder of holders) {
    const cp = cpByHolder.get(holder)!;
    const list: RawTransfer[] = [];
    // Non-holder counterparties: both directions straight from this holder's counts.
    for (const [other, [outN, inN]] of Object.entries(cp)) {
      if (holderSet.has(other)) continue;
      for (let i = 0, n = Math.min(outN, MAX_EDGE_COUNT); i < n; i++) list.push({ from: holder, to: other });
      for (let i = 0, n = Math.min(inN, MAX_EDGE_COUNT); i < n; i++) list.push({ from: other, to: holder });
    }
    // Holder→holder: from the sender's list only, count = max(sender.out, receiver.in).
    for (const other of holders) {
      if (other === holder) continue;
      const n = Math.min(MAX_EDGE_COUNT, Math.max(cp[other]?.[0] || 0, cpByHolder.get(other)![holder]?.[1] || 0));
      for (let i = 0; i < n; i++) list.push({ from: holder, to: other });
    }
    out.set(holder, list);
  }
  return out;
}
