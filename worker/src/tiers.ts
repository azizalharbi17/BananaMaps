import { cfg, Tier } from './config';
import type { TokenMeta } from '../../lib/graphCore';

/** Liquidity + 24h volume → tier. A recent user request keeps a token at least warm. */
export function computeTier(meta: Partial<TokenMeta> | undefined, lastRequestedAt?: string | null): Tier {
  const vol = meta?.volume24h || 0;
  const liq = meta?.liquidityUsd || 0;
  const t = cfg.tiers;
  let tier: Tier = 'cold';
  if (vol >= t.hotVol || (liq >= t.hotLiq && vol >= t.warmVol)) tier = 'hot';
  else if (vol >= t.warmVol || liq >= t.warmLiq) tier = 'warm';
  if (tier === 'cold' && lastRequestedAt && Date.now() - new Date(lastRequestedAt).getTime() < 24 * 3600_000) tier = 'warm';
  return tier;
}

export function syncIntervalMs(tier: Tier, chain: string): number {
  return Math.round(cfg.intervals[tier] * cfg.intervalMultiplier(chain));
}

export function holdersRefreshMs(tier: Tier): number {
  return cfg.holdersRefresh[tier];
}
