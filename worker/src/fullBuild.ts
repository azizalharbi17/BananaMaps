// Full (re)build of a token's sync state from scratch: top holders + one page of
// history per holder through the same lib fetchers the on-demand builder uses,
// then a cursor positioned at "now" so the next sync is a pure delta.
//
// Log-replay chains (Robinhood) are different: one unbounded pass over the
// token's Transfer logs since genesis yields exact balances for every address
// (the ledger), the top set, every holder's counterparty counts and the supply,
// and the cursor lands exactly at replay head + 1 — no overlap, no hole.
import {
  fetchHolders, fetchTransfers, fetchTokenMeta, fetchLogSnapshot, tryFetchJson, NotIndexedError, UpstreamError, isLogChain,
} from '../../lib/graphBuilder';
import type { AddrLabel } from '../../lib/graphCore';
import { normAddr } from '../../lib/graphCore';
import { cpFor, currentRobinhoodProvider, formatUnits } from '../../lib/robinhoodRpc';
import { cfg } from './config';
import { log, errMsg } from './log';
import { budget, withProvider, ProviderName } from './budget';
import { SyncState, emptyState, replaceHolders, ingestHistory, ledgerFromReplay, pruneHistories } from './state';
import { evmHeadCursor } from './providers/evm';
import { solTokenAccounts, solNewestSignatures } from './providers/sol';

export class PartialBuildError extends Error {}
export class NotFoundError extends Error {}

export function holderProvider(chain: string): ProviderName {
  if (chain === 'sol') return process.env.VYBE_API_KEY ? 'vybe' : 'helius';
  if (isLogChain(chain)) return currentRobinhoodProvider();
  return 'moralis';
}
export function historyProvider(chain: string): ProviderName {
  if (chain === 'sol') return 'helius';
  if (isLogChain(chain)) return currentRobinhoodProvider();
  return 'moralis';
}
export function deltaProvider(chain: string): ProviderName {
  if (chain === 'sol') return 'helius';
  if (isLogChain(chain)) return currentRobinhoodProvider();
  return 'moralis';
}

/** Approximate provider calls a full build costs (admission control). */
export function fullBuildEstimate(chain: string): Partial<Record<ProviderName, number>> {
  if (chain === 'sol') return { vybe: 1, helius: 150 + 2 * 15 + 10 };
  // A replay is ~1 call per 3-6k transfers of history (+ ~10 empty genesis-side
  // chunks): a brand-new token ~15 calls, mid-size tokens ~200, CASHCAT (13M
  // transfers) ~4000 over 38 min. The call gate (budget.ts) stops an
  // underestimated replay the moment the day's cap is reached.
  if (isLogChain(chain)) return { [currentRobinhoodProvider()]: 300 };
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

async function notFoundOrNotIndexed(addr: string): Promise<never> {
  const dex = await tryFetchJson(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
  if (dex?.pairs?.length) throw new NotIndexedError('token exists but holder data is not indexed yet');
  throw new NotFoundError('token not found on any source');
}

/** Robinhood & co: state straight from a full Transfer-log replay (see header). */
async function fullBuildFromLogs(chain: string, addr: string): Promise<FullBuildResult> {
  const t0 = Date.now();
  const provider = currentRobinhoodProvider();
  let lastLogged = 0;
  const snap = await withProvider(provider, () => fetchLogSnapshot(addr, chain, {
    maxCalls: Infinity,
    withTransfers: false, // counts via cpFor below; the expanded lists are only for on-demand buildGraph calls
    onProgress: p => {
      if (p.calls - lastLogged >= 25) { lastLogged = p.calls; log.info('replay progress', { chain, address: addr, calls: p.calls, logs: p.logs, block: p.block, head: p.head }); }
    },
  }));
  if (!snap.holders.length) await notFoundOrNotIndexed(addr);
  const { replay, info } = snap;

  const state = emptyState(chain, addr, { kind: 'rpc', block: replay.head + 1 });
  state.decimals = info.decimals;
  replaceHolders(state, snap.holders);
  const cps = cpFor(replay, state.holders.map(h => h.address));
  for (const h of state.holders) {
    const hist = state.hist[h.address];
    hist.cp = cps.get(h.address) || {};
    hist.synced = true;
  }
  pruneHistories(state, cfg.maxCpPerHolder);
  state.ledger = ledgerFromReplay(replay, cfg.rhLedgerMaxEntries);
  state.ledger.lastVerifiedAt = snap.verified ? new Date().toISOString() : undefined;
  state.supplyFormatted = formatUnits(replay.supply, info.decimals);
  for (const [a, l] of snap.labels) if (l.labelType) state.labels[a] = l;
  state.meta = snap.meta;
  state.lastFullBuildAt = new Date().toISOString();

  log.info('full build complete (log replay)', {
    chain, address: addr, holders: state.holders.length, totalHolders: replay.holderCount, transfers: replay.logCount,
    firstBlock: replay.firstBlock, head: replay.head, calls: replay.calls, verified: snap.verified,
    ledgerEntries: state.ledger.tracked, evicted: state.ledger.evicted, ms: Date.now() - t0,
  });
  return { state, harvested: snap.labels, calls: { holders: replay.calls, histories: 0, cursor: 1 } };
}

export async function fullBuild(chain: string, address: string): Promise<FullBuildResult> {
  const t0 = Date.now();
  const addr = normAddr(address, chain);
  if (isLogChain(chain)) return fullBuildFromLogs(chain, addr);
  const calls = { holders: 0, histories: 0, cursor: 0 };

  const { holders, labels } = await withProvider(holderProvider(chain), () => fetchHolders(chain, addr));
  calls.holders = 2;
  if (!holders.length) await notFoundOrNotIndexed(addr);

  // Cursor right after the holder snapshot and BEFORE the history pages: the
  // delta stream then applies exactly the transfers newer than the balances we
  // just fetched (balances stay consistent). History pages fetched afterwards
  // may overlap the first delta window by a few transfers (edge counts only,
  // bounded by the fetch duration) — preferable to a permanent hole.
  let cursor: SyncState['cursor'];
  if (chain === 'sol') cursor = { kind: 'sol', syncs: 0 };
  else {
    cursor = await withProvider('moralis', () => evmHeadCursor(chain, addr));
    calls.cursor = 1;
  }
  const state = emptyState(chain, addr, cursor);
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
