// State → TokenGraph. Reuses lib/graphCore.buildGraph (identical node cap, hub
// heuristic and connected-component clustering as on-demand builds) and
// lib/labelResolver for CEX/burn/contract labels — but only for node addresses
// the state hasn't seen before, so steady-state syncs spend nothing on labels.
import { buildGraph } from '../../lib/graphCore';
import type { AddrLabel, TokenMeta } from '../../lib/graphCore';
import type { TokenGraph } from '../../lib/graphTypes';
import { resolveWalletLabels } from '../../lib/labelResolver';
import { log, errMsg } from './log';
import { SyncState, toRawHolders, toTransfersByHolder } from './state';

function labelMap(state: SyncState, harvested?: Map<string, AddrLabel>): Map<string, AddrLabel> {
  const m = new Map<string, AddrLabel>();
  for (const [a, l] of Object.entries(state.labels)) if (l) m.set(a, l);
  if (harvested) for (const [a, l] of harvested) if (!m.has(a) && l.labelType) m.set(a, l);
  return m;
}

export interface AssembleOptions {
  /** Re-run label resolution for every node (full builds), not just unseen ones. */
  fullResolve?: boolean;
  /** Labels harvested from provider responses during this sync (Moralis entities, Vybe owner names). */
  harvested?: Map<string, AddrLabel>;
}

export async function assembleGraph(state: SyncState, opts: AssembleOptions = {}): Promise<TokenGraph> {
  const meta: TokenMeta = state.meta || { name: '', symbol: '', logo: '', price: 0, priceChange24h: 0 };
  const computedAt = new Date().toISOString();
  const holders = toRawHolders(state);
  const transfers = toTransfersByHolder(state);
  const labels = labelMap(state, opts.harvested);
  const pass1 = buildGraph(state.chain, state.address, { ...meta, holderCount: holders.length }, holders, transfers, labels, computedAt);

  const unknown = pass1.nodes.filter(n => opts.fullResolve || !(n.address in state.labels)).map(n => n.address);
  if (!unknown.length) return pass1;

  const unknownSet = new Set(unknown);
  const suspects = [
    ...pass1.nodes.filter(n => n.kind === 'holder' && !n.labelType && unknownSet.has(n.address)).sort((a, b) => b.degree - a.degree).map(n => n.address),
    ...pass1.nodes
      .filter(n => n.kind === 'counterparty' && (!n.labelType || n.label === 'Exchange-like (unverified)') && n.degree >= 3 && unknownSet.has(n.address))
      .sort((a, b) => b.degree - a.degree)
      .map(n => n.address),
  ];
  let changed = false;
  try {
    const resolved = await resolveWalletLabels(state.chain, { addresses: unknown, apiLabels: labels, suspects });
    for (const addr of unknown) {
      const lb = resolved.get(addr) || null;
      const prev = state.labels[addr] ?? labels.get(addr) ?? null;
      state.labels[addr] = lb || (labels.get(addr) ?? null);
      if ((lb?.label !== prev?.label) || (lb?.labelType !== prev?.labelType)) changed = true;
    }
  } catch (e) {
    log.warn('label resolution failed; keeping pass-1 labels', { chain: state.chain, address: state.address, error: errMsg(e) });
    return pass1;
  }
  if (!changed) return pass1;
  return buildGraph(state.chain, state.address, { ...meta, holderCount: holders.length }, holders, transfers, labelMap(state, opts.harvested), computedAt);
}
