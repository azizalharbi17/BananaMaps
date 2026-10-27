import { cfg, Tier } from './config';
import type { TokenMeta } from '../../lib/graphCore';

/**
 * Liquidity + 24h volume → tier. Attention overrides size: a token someone opened
 * in the last ACTIVE_VIEW_MS runs hot (10-minute syncs, bounded by what people
 * actually look at), and one requested in the last 24 h stays at least warm.
 */
export const ACTIVE_VIEW_MS = 30 * 60_000;
export function computeTier(meta: Partial<TokenMeta> | undefined, lastRequestedAt?: string | null): Tier {
  const vol = meta?.volume24h || 0;
  const liq = meta?.liquidityUsd || 0;
  const t = cfg.tiers;
  let tier: Tier = 'cold';
  if (vol >= t.hotVol || (liq >= t.hotLiq && vol >= t.warmVol)) tier = 'hot';
  else if (vol >= t.warmVol || liq >= t.warmLiq) tier = 'warm';
  const sinceRequest = lastRequestedAt ? Date.now() - new Date(lastRequestedAt).getTime() : Infinity;
  if (sinceRequest < ACTIVE_VIEW_MS) tier = 'hot';
  else if (tier === 'cold' && sinceRequest < 24 * 3600_000) tier = 'warm';
  return tier;
}

export function syncIntervalMs(tier: Tier, chain: string): number {
  return Math.round(cfg.intervals[tier] * cfg.intervalMultiplier(chain));
}

export function holdersRefreshMs(tier: Tier): number {
  return cfg.holdersRefresh[tier];
}
