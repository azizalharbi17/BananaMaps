// Small formatters and snippet builders shared by the developer portal pages.
import type { ApiPlan, BillingInterval } from '@/lib/plans';

export const SITE_URL = 'https://www.bananamaps.io';
export const API_BASE = `${SITE_URL}/v1`;

export const fmtNum = (n: number) => n.toLocaleString('en-US');

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Same as fmtDate but in UTC — quota periods are UTC calendar months. */
export function fmtDateUtc(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "just now" / "12m ago" / "3h ago" / "2d ago" / "never". */
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never';
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Display price for a plan at an interval: { amount, per, note }. */
export function priceParts(priceMonthly: number, priceYearly: number, interval: BillingInterval): { amount: string; per: string; note: string } {
  if (priceMonthly === 0) return { amount: '$0', per: '', note: 'Free forever' };
  if (interval === 'year') {
    const perMonth = Math.round(priceYearly / 12);
    return { amount: `$${fmtNum(priceYearly)}`, per: '/ year', note: `≈ $${perMonth} a month · 2 months free` };
  }
  return { amount: `$${fmtNum(priceMonthly)}`, per: '/ month', note: `or $${fmtNum(priceYearly)} a year (2 months free)` };
}

/** Feature bullets for an API plan card. */
export function apiPlanFeatures(p: ApiPlan): string[] {
  const out = [`${fmtNum(p.monthlyQuota)} calls a month`, `${p.perMinute} calls a minute`, 'All four endpoints, all five chains'];
  if (p.tier === 'free') out.push('Community support');
  else if (p.tier === 'starter') out.push('Email support');
  else out.push('Priority email support');
  return out;
}

export interface EmbedSnippetOptions {
  pid?: string | null;
  token?: string;
  chain?: string;
  /** false adds badge=0 (Partner plan only). */
  badge?: boolean;
  /** "#RRGGBB" adds accent=RRGGBB (Partner plan only). */
  accent?: string | null;
}

/** The copy-paste BananaMaps Embed tag. The tag name appears only inside this literal snippet. */
export function embedSnippet(opts: EmbedSnippetOptions = {}): string {
  const { pid = 'YOUR_PID', token = 'TOKEN_ADDRESS', chain = 'eth', badge = true, accent = null } = opts;
  const params = [`token=${token}`, `chain=${chain}`];
  if (pid) params.push(`pid=${pid}`);
  if (!badge) params.push('badge=0');
  if (accent) params.push(`accent=${accent.replace('#', '').toUpperCase()}`);
  return [
    '<iframe',
    `  src="${SITE_URL}/embed?${params.join('&')}"`,
    '  width="100%"',
    '  height="600"',
    '  style="border:0;border-radius:12px"',
    '  loading="lazy"',
    '  title="BananaMaps Embed"',
    '></iframe>',
  ].join('\n');
}

export const curlExample = (path: string) => `curl "${API_BASE}${path}" \\\n  -H "Authorization: Bearer bm_live_YOUR_KEY"`;
