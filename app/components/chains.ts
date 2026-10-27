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
