// One token, one sync. Decides between bootstrap (seed state from the cached
// graph), full build, or incremental delta application; assembles and publishes
// the graph; persists state; schedules the next run; applies backoff on errors.
import {
  fetchHolders, fetchTokenMeta, fetchTransfersEVM, fetchTransfersSOL,
  tryFetchJson, bestPair, sumVolume24h, UpstreamError, NotIndexedError, isLogChain, TOP_HOLDERS,
} from '../../lib/graphBuilder';
import { balancesOf, tokenInfo, currentRobinhoodProvider, ZERO_ADDR } from '../../lib/robinhoodRpc';
import type { AddrLabel, RawHolder } from '../../lib/graphCore';
import { cfg, familyOf, Tier } from './config';
import { log, errMsg } from './log';
import { budget, withProvider, runScoped } from './budget';
import type { Store, TokenRow, TokenPatch } from './store';
import type { GraphRepo } from './graphs';
import {
  SyncState, applyTransfer, bootstrapFromGraph, cursorSummary, ingestHistory, pruneHistories, rerankHolders, replaceHolders,
  ledgerApply, ledgerSet, ledgerHolderCount, rerankFromLedger,
} from './state';
import { assembleGraph } from './assemble';
import {
  fullBuild, canAffordFullBuild, solInitCursors, holderProvider, historyProvider, deltaProvider, PartialBuildError, NotFoundError,
} from './fullBuild';
import { evmFetchDeltas, evmHeadCursor, EvmCursor } from './providers/evm';
import { hasRpc, rpcHead, rpcDecimals, rpcFetchDeltas, rpcHolderHistory, rpcDeltaEstimate } from './providers/robinhood';
import { solPollSignatures, solParseTransfers } from './providers/sol';
import { computeTier, syncIntervalMs, holdersRefreshMs } from './tiers';

export type SyncMode = 'full' | 'bootstrap' | 'incremental' | 'skipped';

export interface SyncOutcome {
  chain: string;
  address: string;
  symbol?: string;
  mode: SyncMode;
  ok: boolean;
  ms: number;
  deltaTransfers: number;
  calls: Record<string, number>;
  truncated?: boolean;
  newHolders?: number;
  holdersRefreshed?: boolean;
  graph?: { nodes: number; edges: number; clusters: number };
  skipReason?: string;
  error?: string;
  nextSyncAt?: string;
  tier?: Tier;
  cursor?: string;
}

export interface SyncContext {
  store: Store;
  graphs: GraphRepo;
  instanceId: string;
  fullBuildsThisHour(): number;
  noteFullBuild(): void;
}

export interface SyncOptions {
  force?: 'full' | 'incremental';
  skipClaim?: boolean;
}

const nowIso = () => new Date().toISOString();
const olderThan = (iso: string | undefined, ms: number) => !iso || Date.now() - new Date(iso).getTime() >= ms;

// ---------- helpers ----------

async function refreshPrice(state: SyncState) {
  const dex = await tryFetchJson(`https://api.dexscreener.com/latest/dex/tokens/${state.address}`);
  const pair = bestPair(dex?.pairs, state.address, state.chain);
  if (!pair || !state.meta) return;
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  state.meta = {
    ...state.meta,
    price: n(pair.priceUsd) || state.meta.price,
    priceChange24h: n(pair.priceChange?.h24),
    marketCap: n(pair.marketCap) || n(pair.fdv) || state.meta.marketCap,
    volume24h: sumVolume24h(dex?.pairs, state.address, state.chain) || state.meta.volume24h,
    liquidityUsd: n(pair.liquidity?.usd) || state.meta.liquidityUsd,
    logo: state.meta.logo || pair.info?.imageUrl || '',
    name: state.meta.name || pair.baseToken?.name || '',
    symbol: state.meta.symbol || pair.baseToken?.symbol || '',
  };
}

/** Initial history for holders that joined the top set mid-stream. */
async function initHolderHistories(state: SyncState, added: string[], labels: Map<string, AddrLabel>): Promise<void> {
  const chain = state.chain;
  const raws: RawHolder[] = state.holders.filter(h => added.includes(h.address)).map(h => ({ address: h.address, balanceFormatted: h.balanceFormatted, pct: h.pct, usdValue: h.usdValue }));
  if (!raws.length) return;
  if (chain === 'sol') {
    await solInitCursors(state, raws.map(h => h.address), labels); // cursor first (see fullBuild.ts)
    const { transfers } = await withProvider('helius', () => fetchTransfersSOL(state.address, raws, labels));
    for (const h of raws) ingestHistory(state, h.address, transfers.get(h.address) || []);
    return;
  }
  if (isLogChain(chain)) {
    // The holder's transfers of this token, newest first, scanned back from the
    // cursor to the token's first block (≈ 1 getLogs call per 10M blocks and
    // direction on the public RPC; the ledger knows where the token started).
    if (state.cursor.kind !== 'rpc') return;
    const toBlock = state.cursor.block - 1;
    const fromBlock = state.ledger?.firstBlock ?? 1;
    const rh = currentRobinhoodProvider();
    // Two reverse scans (sent / received) of ≤10M blocks each on the public RPC.
    const perHolder = Math.ceil(Math.max(1, toBlock - fromBlock) / 10_000_000) * 2 + 2;
    for (const h of raws) {
      if (!budget.canSpend(rh, perHolder)) { log.warn('holder history deferred: budget', { chain, holder: h.address, estimatedCalls: perHolder }); break; }
      try {
        const list = await withProvider(rh, () => rpcHolderHistory(chain, state.address, h.address, fromBlock, toBlock, cfg.rhHistoryMaxLogs));
        ingestHistory(state, h.address, list);
      } catch (e) {
        log.warn('rpc holder history failed', { chain, holder: h.address, error: errMsg(e) });
        ingestHistory(state, h.address, []); // synced with an empty history; deltas accumulate from here
      }
    }
    return;
  }
  const { transfers } = await withProvider('moralis', () => fetchTransfersEVM(state.address, chain, raws, labels));
  for (const h of raws) ingestHistory(state, h.address, transfers.get(h.address) || []);
}

async function captureCursor(state: SyncState, labels: Map<string, AddrLabel>): Promise<void> {
  const chain = state.chain;
  if (chain === 'sol') {
    state.cursor = { kind: 'sol', syncs: 0 };
    await solInitCursors(state, state.holders.map(h => h.address), labels);
  } else if (hasRpc(chain)) {
    const rh = currentRobinhoodProvider();
    const head = await withProvider(rh, () => rpcHead(chain));
    state.decimals = await withProvider(rh, () => rpcDecimals(chain, state.address));
    state.cursor = { kind: 'rpc', block: head + 1 };
  } else {
    state.cursor = await withProvider('moralis', () => evmHeadCursor(chain, state.address));
  }
}

interface IncrementalResult { deltaTransfers: number; truncated: boolean; newHolders: number; holdersRefreshed: boolean; harvested: Map<string, AddrLabel> }

async function incremental(state: SyncState, tier: Tier): Promise<IncrementalResult> {
  const chain = state.chain;
  const harvested = new Map<string, AddrLabel>();
  let deltaTransfers = 0;
  let truncated = false;

  // 1. Deltas since the cursor
  if (state.cursor.kind === 'evm') {
    const cur = state.cursor as EvmCursor;
    const r = await withProvider('moralis', () => evmFetchDeltas(chain, state.address, cur, cfg.maxDeltaPages, harvested));
    for (const d of r.deltas) applyTransfer(state, d.from, d.to, d.value);
    state.cursor = r.next;
    deltaTransfers = r.deltas.length;
    truncated = r.truncated;
  } else if (state.cursor.kind === 'rpc') {
    const rh = currentRobinhoodProvider();
    if (state.decimals === undefined) state.decimals = await withProvider(rh, () => rpcDecimals(chain, state.address));
    const from = state.cursor.block;
    const r = await withProvider(rh, () => rpcFetchDeltas(chain, state.address, from, state.decimals!));
    for (const d of r.deltas) {
      if (state.ledger) {
        // Balances live in the ledger (every address, raw units); applyTransfer only counts edges.
        ledgerApply(state, d.from, d.to, d.raw, cfg.rhLedgerMaxEntries);
        if (d.from !== ZERO_ADDR && d.to !== ZERO_ADDR) applyTransfer(state, d.from, d.to, 0, { edges: true });
      } else {
        applyTransfer(state, d.from, d.to, d.value);
      }
    }
    // Load-balanced public RPCs can answer from a lagging node: never rewind the cursor.
    state.cursor = { kind: 'rpc', block: Math.max(from, r.head + 1) };
    deltaTransfers = r.deltas.length;
    if (state.ledger) {
      state.ledger.head = Math.max(state.ledger.head, r.head);
      // Exact top set from the ledger, no provider call; entrants need their history.
      const { added, removed } = rerankFromLedger(state, TOP_HOLDERS);
      if (added.length || removed.length) log.info('holder set changed', { chain, address: state.address, added: added.length, removed: removed.length });
    }
  } else {
    state.cursor.syncs++;
    const syncs = state.cursor.syncs;
    // Holders whose token accounts could not be looked up earlier (rate limit) get another try.
    const pending = Object.entries(state.hist).filter(([, h]) => h.synced && !h.skipped && h.accounts === undefined).map(([a]) => a);
    if (pending.length && budget.canSpend('helius', Math.ceil(pending.length / 5) * 2)) {
      const labels = new Map<string, AddrLabel>();
      for (const [a, l] of Object.entries(state.labels)) if (l) labels.set(a, l);
      try { await solInitCursors(state, pending, labels); } catch (e) { log.warn('sol account lookup retry failed', { chain, error: errMsg(e) }); }
    }
    const items: { holder: string; account: string; until: string | null; acc: NonNullable<SyncState['hist'][string]['accounts']>[number] }[] = [];
    for (const [holder, h] of Object.entries(state.hist)) {
      if (h.skipped || !h.synced) continue;
      for (const a of h.accounts || []) if (a.nextPollAt <= syncs) items.push({ holder, account: a.address, until: a.lastSig, acc: a });
    }
    if (items.length) {
      const polled = await withProvider('helius', () => solPollSignatures(items.map(i => ({ account: i.account, until: i.until })), cfg.solMaxSigPages));
      const toParse: { holder: string; sigs: string[] }[] = [];
      items.forEach((it, i) => {
        const p = polled[i];
        if (!p || p.error) return; // cursor untouched; retried next sync
        if (!it.until) { it.acc.lastSig = p.signatures[0] || null; it.acc.nextPollAt = syncs + 1; return; }
        if (p.signatures.length) {
          it.acc.lastSig = p.signatures[0];
          it.acc.idle = 0;
          it.acc.nextPollAt = syncs + 1;
          toParse.push({ holder: it.holder, sigs: p.signatures });
          if (p.truncated) truncated = true;
        } else {
          it.acc.idle = Math.min(it.acc.idle + 1, 20);
          it.acc.nextPollAt = syncs + Math.min(2 ** it.acc.idle, cfg.solIdleBackoffMax);
        }
      });
      if (toParse.length) {
        const sigHolders = new Map<string, Set<string>>();
        for (const t of toParse) for (const s of t.sigs) { let set = sigHolders.get(s); if (!set) { set = new Set(); sigHolders.set(s, set); } set.add(t.holder); }
        const { transfers } = await withProvider('helius', () => solParseTransfers([...sigHolders.keys()], state.address));
        for (const tr of transfers) {
          // Balances follow every movement of the mint (swaps included); edges keep
          // the full build's wallet-to-wallet filter (type TRANSFER).
          const edges = tr.type === 'TRANSFER';
          for (const holder of sigHolders.get(tr.signature) || []) {
            if (applyTransfer(state, tr.from, tr.to, tr.amount, { only: holder, edges }) && edges) deltaTransfers++;
          }
        }
      }
    }
  }

  // 2. Authoritative holder refresh on the tier cadence; otherwise delta-derived balances + a cheap price refresh.
  let newHolders = 0;
  let holdersRefreshed = false;
  const hp = holderProvider(chain);
  if (state.ledger) {
    // The top set is already exact (ledger). On the tier cadence: confirm the top
    // balances on-chain (fee/rebase tokens drift from their Transfer logs), refresh
    // name/symbol if missing, market data and the true holder count.
    if (olderThan(state.ledger.lastVerifiedAt, holdersRefreshMs(tier)) && budget.canSpend(hp, 8)) {
      try {
        // Pinned to the block the ledger is exact at (this sync's delta head): a
        // 'latest' read would already include transfers the next sync applies again.
        const ledger = state.ledger;
        const onchain = await withProvider(hp, () => balancesOf(state.address, state.holders.map(h => h.address), ledger.head));
        if (onchain.size) {
          ledgerSet(state, onchain, cfg.rhLedgerMaxEntries);
          rerankFromLedger(state, TOP_HOLDERS);
          holdersRefreshed = true;
        } else {
          log.warn('ledger verification: balanceOf unavailable at ledger head; keeping replayed balances', { chain, address: state.address, block: ledger.head });
        }
        ledger.lastVerifiedAt = nowIso();
        if (!state.meta?.name || !state.meta?.symbol) {
          const info = await withProvider(hp, () => tokenInfo(state.address));
          state.meta = { ...(state.meta || { name: '', symbol: '', logo: '', price: 0, priceChange24h: 0 }), name: state.meta?.name || info.name, symbol: state.meta?.symbol || info.symbol };
        }
        if (budget.canSpend('dexscreener', 1)) await refreshPrice(state);
        if (state.meta) { state.meta.totalHolders = ledgerHolderCount(state.ledger); state.meta.holderCount = state.holders.length; }
      } catch (e) {
        log.warn('ledger verification failed; continuing with replayed balances', { chain, address: state.address, error: errMsg(e) });
      }
    }
  } else if (isLogChain(chain)) {
    // No ledger yet (state bootstrapped from a cached graph): a holder refresh would
    // be a full replay — the scheduler runs that as a proper full build instead.
    log.debug('holder refresh skipped until the log replay full build runs', { chain, address: state.address });
  } else if (olderThan(state.lastHoldersRefreshAt, holdersRefreshMs(tier)) && budget.canSpend(hp, 3)) {
    try {
      const { holders, labels } = await withProvider(hp, () => fetchHolders(chain, state.address));
      if (holders.length) {
        for (const [a, l] of labels) harvested.set(a, l);
        const { added, removed } = replaceHolders(state, holders);
        holdersRefreshed = true;
        newHolders = added.length;
        state.meta = await fetchTokenMeta(chain, state.address, holders.length);
        if (added.length && budget.canSpend(historyProvider(chain), added.length + 2)) {
          await initHolderHistories(state, added, harvested);
        }
        if (added.length || removed.length) log.info('holder set changed', { chain, address: state.address, added: added.length, removed: removed.length });
      }
    } catch (e) {
      log.warn('holders refresh failed; continuing with delta-derived balances', { chain, address: state.address, error: errMsg(e) });
    }
  }
  // Holders whose initial history was deferred by a budget cap (or a failed
  // fetch) are retried here so they don't stay edge-less until the next refresh.
  const unsynced = Object.entries(state.hist).filter(([, h]) => !h.synced && !h.skipped && !h.parked).map(([a]) => a);
  if (unsynced.length && budget.canSpend(historyProvider(chain), unsynced.length + 2)) {
    try { await initHolderHistories(state, unsynced, harvested); newHolders += unsynced.length; }
    catch (e) { log.warn('deferred holder histories failed', { chain, address: state.address, holders: unsynced.length, error: errMsg(e) }); }
  }
  if (!holdersRefreshed) {
    if (!state.ledger) rerankHolders(state); // ledger states are already ranked exactly
    if (budget.canSpend('dexscreener', 1)) {
      try { await refreshPrice(state); } catch (e) { log.debug('price refresh failed', { error: errMsg(e) }); }
    }
  }

  pruneHistories(state, cfg.maxCpPerHolder);
  return { deltaTransfers, truncated, newHolders, holdersRefreshed, harvested };
}

function estimateIncremental(state: SyncState): { provider: string; calls: number } {
  const p = deltaProvider(state.chain);
  if (state.cursor.kind === 'evm') return { provider: p, calls: 3 };
  if (state.cursor.kind === 'rpc') return { provider: p, calls: rpcDeltaEstimate() };
  let due = 0;
  const syncs = state.cursor.syncs + 1;
  for (const h of Object.values(state.hist)) if (!h.skipped && h.synced) for (const a of h.accounts || []) if (a.nextPollAt <= syncs) due++;
  return { provider: p, calls: due + 2 }; // one RPC request per polled account (batch elements each count)
}

function backoffMs(errors: number): number {
  return Math.min(cfg.backoff.maxMs, cfg.backoff.baseMs * Math.pow(2, Math.max(0, errors - 1)));
}

// ---------- entry point ----------

export async function syncToken(ctx: SyncContext, row: TokenRow, opts: SyncOptions = {}): Promise<SyncOutcome> {
  const { chain, address } = row;
  const t0 = Date.now();
  const base = { chain, address, symbol: row.symbol || undefined };
  const finish = (o: Partial<SyncOutcome> & { mode: SyncMode; ok: boolean }, calls: Record<string, number> = {}): SyncOutcome =>
    ({ ...base, deltaTransfers: 0, calls, ms: Date.now() - t0, ...o });

  if (!opts.skipClaim && !(await ctx.store.claimToken(chain, address, ctx.instanceId, cfg.claimStaleMs))) {
    return finish({ mode: 'skipped', ok: true, skipReason: 'claimed-elsewhere' });
  }

  const { result, calls } = await runScoped(async (): Promise<SyncOutcome> => {
    let releasePatch: TokenPatch = {};
    try {
      const tier: Tier = row.tier_override || row.tier || 'warm';
      let state = await ctx.store.getState(chain, address);
      let mode: SyncMode = 'incremental';
      let harvested = new Map<string, AddrLabel>();
      let inc: IncrementalResult | null = null;
      let bootstrapGraphAt: string | null = null;
      let rebuildDeferred = false;

      const fullWanted = opts.force === 'full'
        || (!state && !(await ctx.graphs.get(chain, address)))
        // State missing for a token that has synced before = STATE_VERSION bump or a
        // deleted state row: honour needs_full_build with a real rebuild (bootstrap
        // from the worker's own capped graph would be lossy); falls back to
        // bootstrap below only when a rebuild is unaffordable right now.
        || (!state && !!row.last_synced_at && row.needs_full_build && opts.force !== 'incremental')
        || (!!state && (row.needs_full_build || olderThan(state.lastFullBuildAt, cfg.fullRebuildEveryMs)) && opts.force !== 'incremental')
        // Log-replay chains: a state without a ledger (bootstrapped from a cached
        // graph, or built before ledgers existed) can't rank holders exactly — one
        // replay fixes that for good.
        // Paced by lastFullBuildAt (a failed attempt stamps it) so a replay that keeps
        // failing can't re-run every sync and drain the day's budget.
        || (!!state && isLogChain(chain) && !state.ledger && olderThan(state.lastFullBuildAt, cfg.rhLedgerRetryMs) && opts.force !== 'incremental');

      if (fullWanted && opts.force !== 'full' && (!canAffordFullBuild(chain) || ctx.fullBuildsThisHour() >= cfg.maxFullBuildsPerHour)) {
        if (!state && !(await ctx.graphs.get(chain, address))) {
          // Nothing to serve from yet and no budget to build: come back soon. The
          // request flag is cleared so the deferral is honoured (the app re-flags
          // on the next user request).
          releasePatch = { next_sync_at: new Date(Date.now() + 15 * 60_000).toISOString(), sync_requested_at: null };
          return finish({ mode: 'skipped', ok: true, skipReason: 'full-build-deferred', nextSyncAt: releasePatch.next_sync_at! });
        }
        // Keep serving incrementally (or bootstrap below); the rebuild waits for headroom.
      } else if (fullWanted) {
        try {
          const r = await fullBuild(chain, address);
          ctx.noteFullBuild(); // only completed builds count toward the hourly cap; failures are paced by backoff
          state = r.state;
          harvested = r.harvested;
          mode = 'full';
        } catch (e) {
          // A rebuild failure (provider outage, holders not indexed anywhere right
          // now, partial histories) must not take a token that already has state
          // out of rotation: keep it fresh incrementally and retry the rebuild on
          // the next drift-reset interval. Only a token with nothing to serve
          // from propagates the error (→ backoff / disable).
          if (!state) throw e;
          log.warn('full rebuild failed; continuing incrementally', { chain, address, error: errMsg(e) });
          state.lastFullBuildAt = nowIso();
          rebuildDeferred = true;
        }
      }

      if (!state) {
        // Bootstrap from the existing snapshot — cheap: cursor capture only.
        const cached = await ctx.graphs.get(chain, address);
        if (!cached) throw new Error('no cached graph to bootstrap from');
        const g = cached.graph;
        state = bootstrapFromGraph(g, { kind: 'sol', syncs: 0 });
        const labels = new Map<string, AddrLabel>();
        for (const [a, l] of Object.entries(state.labels)) if (l) labels.set(a, l);
        await captureCursor(state, labels);
        mode = 'bootstrap';
        bootstrapGraphAt = cached.computedAt;
        log.info('bootstrapped state from cached graph', { chain, address, holders: state.holders.length, cursor: cursorSummary(state), graphAge: cached.computedAt });
      }

      if (mode !== 'full') {
        const est = estimateIncremental(state);
        if (!budget.canSpend(est.provider, est.calls)) {
          releasePatch = {
            next_sync_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            sync_requested_at: null,
            ...(mode === 'bootstrap' ? { needs_full_build: false, last_full_build: bootstrapGraphAt } : {}),
          };
          if (mode === 'bootstrap') await ctx.store.saveState(chain, address, state);
          return finish({ mode: 'skipped', ok: true, skipReason: `budget:${est.provider}`, nextSyncAt: releasePatch.next_sync_at! });
        }
        inc = await incremental(state, tier);
        for (const [a, l] of inc.harvested) harvested.set(a, l);
      }

      const graph = await assembleGraph(state, { fullResolve: mode === 'full', harvested });
      await ctx.graphs.save(chain, address, graph);
      state.stats.syncs++;
      state.stats.lastDeltaTransfers = inc?.deltaTransfers || 0;
      state.stats.lastSyncMs = Date.now() - t0;
      await ctx.store.saveState(chain, address, state);

      const newTier: Tier = row.tier_override || computeTier(state.meta, row.last_requested_at);
      const next = new Date(Date.now() + syncIntervalMs(newTier, chain)).toISOString();
      releasePatch = {
        tier: newTier,
        symbol: graph.symbol || row.symbol,
        name: graph.name || row.name,
        liquidity_usd: state.meta?.liquidityUsd ?? null,
        volume_24h_usd: state.meta?.volume24h ?? null,
        last_synced_cursor: cursorSummary(state),
        last_synced_at: nowIso(),
        next_sync_at: next,
        sync_requested_at: null,
        sync_count: (row.sync_count || 0) + 1,
        consecutive_errors: 0,
        backoff_until: null,
        last_error: null,
        ...(mode === 'full' ? { last_full_build: nowIso(), needs_full_build: false } : {}),
        // A failed scheduled rebuild follows the drift-reset interval from now on
        // instead of being retried (and failing) every sync.
        ...(rebuildDeferred ? { needs_full_build: false } : {}),
        // A bootstrap is a complete, servable state; the periodic drift reset covers it later.
        ...(mode === 'bootstrap' ? { needs_full_build: false, last_full_build: bootstrapGraphAt } : {}),
      };
      return finish({
        mode, ok: true, deltaTransfers: inc?.deltaTransfers || 0, truncated: inc?.truncated, newHolders: inc?.newHolders,
        holdersRefreshed: inc?.holdersRefreshed, symbol: graph.symbol || base.symbol, tier: newTier, nextSyncAt: next, cursor: cursorSummary(state),
        graph: { nodes: graph.nodes.length, edges: graph.edges.length, clusters: graph.clusters.length },
      });
    } catch (e) {
      const errors = (row.consecutive_errors || 0) + 1;
      let wait = backoffMs(errors);
      let patch: TokenPatch = {};
      if (e instanceof NotFoundError) {
        wait = 6 * 3600_000;
        if (errors >= 3) patch.enabled = false;
      } else if (e instanceof NotIndexedError) {
        wait = 3600_000;
      }
      releasePatch = {
        ...patch,
        consecutive_errors: errors,
        backoff_until: new Date(Date.now() + wait).toISOString(),
        next_sync_at: new Date(Date.now() + wait).toISOString(),
        last_error: errMsg(e).slice(0, 300),
        last_error_at: nowIso(),
        sync_requested_at: null,
      };
      const kind = e instanceof UpstreamError ? 'upstream' : e instanceof PartialBuildError ? 'partial' : e instanceof NotIndexedError ? 'not-indexed' : e instanceof NotFoundError ? 'not-found' : 'error';
      log.error('sync failed', { chain, address, kind, error: errMsg(e), consecutiveErrors: errors, backoffMs: wait });
      return finish({ mode: 'incremental', ok: false, error: `${kind}: ${errMsg(e)}`, nextSyncAt: releasePatch.next_sync_at });
    } finally {
      try { await ctx.store.releaseToken(chain, address, releasePatch); }
      catch (e) { log.error('release failed', { chain, address, error: errMsg(e) }); }
    }
  });
  result.calls = calls;
  return result;
}

export const familyOfRow = (row: TokenRow) => familyOf(row.chain);
