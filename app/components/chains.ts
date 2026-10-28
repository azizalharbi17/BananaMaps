// Chain metadata, trending payload types and small formatters shared by the
// marketing pages (homepage, /about). Kept local to app/components so these
// client components never import server-side lib code.

export interface TrendingToken {
  chain: string;
  address: string;
  name: string;
  symbol: string;
  /** May be '' when the upstream has no image. */
  logo: string;
  /** 24h price change, percent. */
  change24h: number;
  /** 24h volume, USD. */
  volume24h: number;
  /** A holder map snapshot already exists (opens instantly). */
  hasMap?: boolean;
}

export interface TrendingPayload {
  popular: TrendingToken[];
  trending: TrendingToken[];
  byChain: Record<string, TrendingToken[]>;
  trendingAt: string | null;
  fetchedAt: number;
}

export interface ChainMeta {
  id: string;
  label: string;
  color: string;
}

/** Display order: ETH / BSC / SOL / BASE / ROBINHOOD. */
export const CHAINS: ChainMeta[] = [
  { id: 'eth', label: 'Ethereum', color: '#627EEA' },
  { id: 'bsc', label: 'BSC', color: '#F3BA2F' },
  { id: 'sol', label: 'Solana', color: '#9945FF' },
  { id: 'base', label: 'Base', color: '#0052FF' },
  { id: 'robinhood', label: 'Robinhood Chain', color: '#00C805' },
];

export const CHAIN_BY_ID: Record<string, ChainMeta> = Object.fromEntries(CHAINS.map(c => [c.id, c]));

export const UP = '#2EE89A';
export const DOWN = '#EF4444';

export function mapHref(t: TrendingToken): string {
  return `/app?token=${encodeURIComponent(t.address)}&chain=${encodeURIComponent(t.chain)}`;
}

/** +12.3% / -4.0% / +1.2K% — compact enough for a ticker pill. */
export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const a = Math.abs(n);
  const body = a >= 1000 ? `${(a / 1000).toFixed(1)}K` : a >= 100 ? a.toFixed(0) : a.toFixed(1);
  return `${sign}${body}%`;
}

/** $1.2B / $4.5M / $731K / $82 — empty string when unknown. */
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/** "just now" / "12m ago" / "3h ago" / "2d ago" — empty string when unknown. */
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Collapse repeated tokens (same chain + address, any address casing) to one
 * entry: the higher-volume24h one wins (ties: first), kept at the FIRST
 * occurrence's slot so the trending order is preserved. Pure.
 *
 * Client-side twin of dedupeTrending() in lib/trending.ts — client components
 * must not import lib/, so this small duplicate is intended; keep them in sync.
 */
export function dedupeTrending(list: TrendingToken[]): TrendingToken[] {
  const slot = new Map<string, number>();
  const out: TrendingToken[] = [];
  for (const t of list) {
    const key = `${t.chain}:${String(t.address || '').toLowerCase()}`;
    const at = slot.get(key);
    if (at === undefined) {
      slot.set(key, out.length);
      out.push(t);
    } else if ((Number(t.volume24h) || 0) > (Number(out[at].volume24h) || 0)) {
      out[at] = t;
    }
  }
  return out;
}

/** Display identity for the lookalike pass: chain + symbol + name, case- and whitespace-insensitive. */
function lookalikeKey(t: TrendingToken): string | null {
  const norm = (s: unknown) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const symbol = norm(t.symbol);
  if (!symbol) return null;
  return `${t.chain}|${symbol}|${norm(t.name)}`;
}

/**
 * Display-layer pass on top of dedupeTrending(): two DIFFERENT contracts on the
 * same chain with the same symbol AND name (a copycat or relaunch — e.g. the two
 * "Elon 2028" / ELON2028 contracts on eth) are indistinguishable on a card, so
 * only the higher-volume24h one is shown, in the first occurrence's slot. The
 * worker snapshot keeps both contracts; this runs only where lists are rendered
 * (/api/trending and the client hook). Same-contract repeats must already be
 * collapsed by dedupeTrending(). Client copy: app/components/chains.ts.
 */
export function collapseLookalikes(list: TrendingToken[]): TrendingToken[] {
  const slot = new Map<string, number>();
  const out: TrendingToken[] = [];
  for (const t of list) {
    const key = lookalikeKey(t);
    const at = key === null ? undefined : slot.get(key);
    if (at === undefined) {
      if (key !== null) slot.set(key, out.length);
      out.push(t);
    } else if ((Number(t.volume24h) || 0) > (Number(out[at].volume24h) || 0)) {
      out[at] = t;
    }
  }
  return out;
}

/** What the homepage shows: same-contract repeats and same-name lookalikes collapsed. */
export function dedupeForDisplay(list: TrendingToken[]): TrendingToken[] {
  return collapseLookalikes(dedupeTrending(list));
}

/** Round-robin across chains in display order so no single chain dominates. */
export function interleave(byChain: Record<string, TrendingToken[]>, max: number): TrendingToken[] {
  const out: TrendingToken[] = [];
  const lists = CHAINS.map(c => byChain[c.id] || []);
  const longest = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < longest && out.length < max; i++) {
    for (const l of lists) if (l[i] && out.length < max) out.push(l[i]);
  }
  return out;
}
