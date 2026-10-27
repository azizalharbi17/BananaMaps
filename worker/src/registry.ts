// Registry population: seed from every cached graph, enroll GeckoTerminal
// trending tokens per chain, manual enrollment. Insert-if-missing everywhere —
// an existing row's schedule and state are never disturbed.
import { fetchTrendingSnapshot, TrendingSnapshot, TrendingToken, TRENDING_NETWORKS, TRENDING_SNAPSHOT_ID } from '../../lib/trending';
import { normAddr } from '../../lib/graphCore';
import { cfg, Tier } from './config';
import { log, errMsg } from './log';
import { budget } from './budget';
import type { Store } from './store';
import type { GraphRepo } from './graphs';
import { computeTier } from './tiers';

export async function seedFromGraphs(store: Store, graphs: GraphRepo): Promise<{ inserted: number; total: number }> {
  const keys = await graphs.listKeys();
  // Stagger first syncs across the first hour so boot doesn't stampede the providers.
  const rows = keys.map((k, i) => ({
    chain: k.chain, address: normAddr(k.address, k.chain), symbol: k.symbol || null, name: k.name || null,
    enrolled_from: 'seed', volume_24h_usd: k.volume24h || null,
    tier: computeTier({ volume24h: k.volume24h }),
    needs_full_build: true,
    next_sync_at: new Date(Date.now() + (i % 60) * 60_000).toISOString(),
  }));
  const inserted = await store.insertMissing(rows);
  log.info('registry seeded from cached graphs', { graphs: rows.length, inserted });
  return { inserted, total: rows.length };
}

/**
 * Fetch GeckoTerminal's current trending lists and publish them as the
 * `trending` heartbeat row (the homepage/API read it; GT is never called from
 * the visitor path). A round that returns nothing (GT outage, budget) keeps the
 * previous snapshot in place.
 */
export async function refreshTrendingSnapshot(store: Store): Promise<TrendingSnapshot | null> {
  if (!budget.canSpend('geckoterminal', TRENDING_NETWORKS.length)) {
    log.warn('trending snapshot skipped: geckoterminal budget');
    return null;
  }
  const snap = await fetchTrendingSnapshot(cfg.trending.snapshotPerChain);
  const total = Object.values(snap.byChain).reduce((n, l) => n + l.length, 0);
  if (!total) { log.warn('trending snapshot empty; keeping the previous one'); return null; }
  await store.heartbeat(TRENDING_SNAPSHOT_ID, snap.fetchedAt, snap as unknown as Record<string, unknown>);
  log.info('trending snapshot published', { tokens: total, chains: Object.keys(snap.byChain).length });
  return snap;
}

/** Enroll the top trending tokens per chain (from the given snapshot, or a fresh one). */
export async function enrollTrending(store: Store, snapshot?: TrendingSnapshot | null): Promise<{ inserted: number; candidates: number }> {
  const snap = snapshot ?? await refreshTrendingSnapshot(store);
  if (!snap) return { inserted: 0, candidates: 0 };
  const lists: TrendingToken[][] = TRENDING_NETWORKS.map(([, chain]) => (snap.byChain[chain] || []).slice(0, cfg.trending.perChain));
  const rows = lists.flat().map(t => ({
    chain: t.chain, address: normAddr(t.address, t.chain), symbol: t.symbol || null, name: t.name || null,
    enrolled_from: 'trending', volume_24h_usd: t.volume24h || null,
    tier: computeTier({ volume24h: t.volume24h }),
    needs_full_build: true,
  }));
  try {
    const inserted = await store.insertMissing(rows);
    log.info('trending enrollment', { candidates: rows.length, inserted });
    return { inserted, candidates: rows.length };
  } catch (e) {
    log.error('trending enrollment failed', { error: errMsg(e) });
    return { inserted: 0, candidates: rows.length };
  }
}

export async function enrollManual(store: Store, chain: string, address: string, tier?: Tier): Promise<boolean> {
  const n = await store.insertMissing([{
    chain, address: normAddr(address, chain), enrolled_from: 'manual', tier: tier || 'warm', needs_full_build: true,
    ...(tier ? { tier_override: tier } : {}),
    sync_requested_at: new Date().toISOString(),
  }]);
  if (!n) await store.updateToken(chain, normAddr(address, chain), { sync_requested_at: new Date().toISOString(), ...(tier ? { tier_override: tier } : {}) });
  return n > 0;
}
