// Full (re)build of a token's sync state from scratch: top holders + one page of
// history per holder through the same lib fetchers the on-demand builder uses,
// then a cursor positioned at "now" so the next sync is a pure delta.
import {
  fetchHolders, fetchTransfers, fetchTokenMeta, tryFetchJson, NotIndexedError, UpstreamError, isBlockscoutChain,
} from '../../lib/graphBuilder';
import type { AddrLabel } from '../../lib/graphCore';
import { normAddr } from '../../lib/graphCore';
import { cfg } from './config';
import { log, errMsg } from './log';
import { budget, withProvider, ProviderName } from './budget';
import { SyncState, emptyState, replaceHolders, ingestHistory } from './state';
import { evmHeadCursor } from './providers/evm';
import { rpcHead, rpcDecimals, hasRpc } from './providers/robinhood';
import { solTokenAccounts, solNewestSignatures } from './providers/sol';

export class PartialBuildError extends Error {}
export class NotFoundError extends Error {}

export function holderProvider(chain: string): ProviderName {
  if (chain === 'sol') return process.env.VYBE_API_KEY ? 'vybe' : 'helius';
  if (isBlockscoutChain(chain)) return 'blockscout';
  return 'moralis';
}
export function historyProvider(chain: string): ProviderName {
  if (chain === 'sol') return 'helius';
  if (isBlockscoutChain(chain)) return 'blockscout';
  return 'moralis';
}
export function deltaProvider(chain: string): ProviderName {
  if (chain === 'sol') return 'helius';
  if (hasRpc(chain)) return 'robinhood-rpc';
  return 'moralis';
}

/** Approximate provider calls a full build costs (admission control). */
export function fullBuildEstimate(chain: string): Partial<Record<ProviderName, number>> {
  if (chain === 'sol') return { vybe: 1, helius: 150 + 2 * 15 + 10 };
  if (isBlockscoutChain(chain)) return { blockscout: 160, 'robinhood-rpc': 2 };
  return { moralis: 160 };
}

export function canAffordFullBuild(chain: string): boolean {
  for (const [p, n] of Object.entries(fullBuildEstimate(chain))) {
    // keep 30% of the day's cap for incremental work
    if (!budget.canSpend(p, (n || 0) + Math.floor(budget.cap(p) * 0.3))) return false;
  }
  return true;
}

export interface FullBuildResult { state: SyncState; harvested: Map<string, AddrLabel>; calls: { holders: number; histories: number; cursor: number } }

/**
 * Set up Solana per-holder cursors: token accounts for the mint + newest
 * signature per account. Labeled holders (cex/dex/contract/burn) are skipped
 * when SKIP_LABELED_HISTORY is on — their edges arrive from the other side.
 */
export async function solInitCursors(state: SyncState, holders: string[], labels: Map<string, AddrLabel>): Promise<number> {
  const owners = holders.filter(h => {
    const lb = labels.get(h) || state.labels[h];
    if (cfg.skipLabeledHistory && lb?.labelType) { state.hist[h].skipped = true; state.hist[h].accounts = []; return false; }
    return true;
  });
  if (!owners.length) return 0;
  // Tolerant by design: a rate-limited batch leaves those holders' `accounts`
  // undefined (retried on the next sync) instead of failing a 150-call build.
  // A missing newest-signature seeds as null; the first poll sets it.
  let failed = 0;
  for (let i = 0; i < owners.length; i += 25) {
    const group = owners.slice(i, i + 25);
    try {
      const accountsByOwner = await solTokenAccounts(group, state.address);
      const all = [...accountsByOwner.values()].flat();
      let newest = new Map<string, string | null>();
      try { if (all.length) newest = await solNewestSignatures(all); }
      catch (e) { log.warn('sol newest-signature lookup failed; seeding on first poll', { error: errMsg(e) }); }
      for (const owner of group) {
        state.hist[owner].accounts = (accountsByOwner.get(owner) || []).map(a => ({ address: a, lastSig: newest.get(a) ?? null, idle: 0, nextPollAt: 0 }));
      }
    } catch (e) {
      failed += group.length;
      log.warn('sol token-account lookup failed for a holder group; will retry next sync', { holders: group.length, error: errMsg(e) });
    }
  }
  // Own accounting (callers must NOT wrap this in withProvider, whose success
  // path would wipe the error just recorded): a total failure throws so the
  // circuit breaker sees it; a partial one records an error and continues.
  if (failed && failed === owners.length) { budget.recordError('helius'); throw new UpstreamError('helius: every token-account lookup failed'); }
  if (failed) budget.recordError('helius'); else budget.recordSuccess('helius');
  return owners.length - failed;
}

export async function fullBuild(chain: string, address: string): Promise<FullBuildResult> {
  const t0 = Date.now();
  const addr = normAddr(address, chain);
  const calls = { holders: 0, histories: 0, cursor: 0 };

  const { holders, labels } = await withProvider(holderProvider(chain), () => fetchHolders(chain, addr));
  calls.holders = 2;
  if (!holders.length) {
    const dex = await tryFetchJson(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
    if (dex?.pairs?.length) throw new NotIndexedError('token exists but holder data is not indexed yet');
    throw new NotFoundError('token not found on any source');
  }

  // Cursor right after the holder snapshot and BEFORE the history pages: the
  // delta stream then applies exactly the transfers newer than the balances we
  // just fetched (balances stay consistent). History pages fetched afterwards
  // may overlap the first delta window by a few transfers (edge counts only,
  // bounded by the fetch duration) — preferable to a permanent hole.
  let cursor: SyncState['cursor'];
  let decimals: number | undefined;
  if (chain === 'sol') cursor = { kind: 'sol', syncs: 0 };
  else if (hasRpc(chain)) {
    const head = await withProvider('robinhood-rpc', () => rpcHead(chain));
    decimals = await withProvider('robinhood-rpc', () => rpcDecimals(chain, addr));
    cursor = { kind: 'rpc', block: head + 1 };
    calls.cursor = 2;
  } else {
    cursor = await withProvider('moralis', () => evmHeadCursor(chain, addr));
    calls.cursor = 1;
  }
  const state = emptyState(chain, addr, cursor);
  state.decimals = decimals;
  replaceHolders(state, holders);
  for (const [a, l] of labels) if (l.labelType) state.labels[a] = l;
  if (chain === 'sol') calls.cursor = await solInitCursors(state, state.holders.map(h => h.address), labels);

  const { transfers, failedWallets } = await withProvider(historyProvider(chain), () => fetchTransfers(chain, addr, holders, labels));
  calls.histories = holders.length;
  if (failedWallets > holders.length * 0.2) throw new PartialBuildError(`${failedWallets}/${holders.length} wallet histories failed`);

  state.meta = await fetchTokenMeta(chain, addr, holders.length);
  for (const h of state.holders) {
    const list = transfers.get(h.address) || transfers.get(holders.find(x => normAddr(x.address, chain) === h.address)?.address || '') || [];
    ingestHistory(state, h.address, list);
  }
  for (const [a, l] of labels) if (l.labelType && !state.labels[a]) state.labels[a] = l;
  state.lastFullBuildAt = new Date().toISOString();

  log.info('full build complete', { chain, address: addr, holders: holders.length, failedWallets, ms: Date.now() - t0, calls });
  return { state, harvested: labels, calls };
}

export { UpstreamError, NotIndexedError };
