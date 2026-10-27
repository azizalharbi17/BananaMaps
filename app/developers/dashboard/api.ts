// Client-side contract for the dashboard routes (/api/dev/**, /api/billing/**).
// Every request carries the Supabase access token as a Bearer header; errors
// come back as { error: { code, message } } and are rethrown as DevApiError.
import { supabase } from '@/lib/supabase';
import type { ApiTier, BillingInterval, EmbedPlan, Product } from '@/lib/plans';

export interface DashAccount {
  email: string;
  apiTier: ApiTier;
  apiStatus: string;
  apiInterval: BillingInterval | null;
  apiPeriodEnd: string | null;
  apiCancelAtPeriodEnd: boolean;
  embedPlan: EmbedPlan;
  embedStatus: string;
  embedInterval: BillingInterval | null;
  embedPeriodEnd: string | null;
  embedCancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  acceptedTermsAt: string | null;
  createdAt: string;
}

export interface DashKey {
  id: string;
  prefix: string;
  name: string;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
  calls: number;
}

export interface DashUsage {
  period: string;
  used: number;
  quota: number;
  perMinute: number;
  resetsAt: string;
}

export interface DashPartner {
  pid: string;
  name: string;
  domains: string[];
  accent: string | null;
  badge: boolean;
  status: string;
  createdAt: string;
}

export interface AccountPayload {
  account: DashAccount;
  keys: DashKey[];
  usage: DashUsage;
  partners: DashPartner[];
  /** Clear-text first key, only on the response that created the account. */
  firstKey: string | null;
  billingConfigured: boolean;
}

export class DevApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'DevApiError';
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Authenticated JSON request to a dashboard route. */
export async function devFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new DevApiError(401, 'unauthorized', 'Sign in to continue.');
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method || 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new DevApiError(0, 'network', 'Could not reach the server. Check your connection and try again.');
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new DevApiError(res.status, err?.code || 'error', err?.message || `Request failed (${res.status}).`);
  }
  return body as T;
}

export const errorMessage = (e: unknown): string =>
  e instanceof DevApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong.';

/** Effective Embed plan: a canceled Partner subscription has free-plan features (mirrors the server). */
export const effectiveEmbedPlan = (a: DashAccount): EmbedPlan =>
  a.embedPlan === 'partner' && a.embedStatus !== 'canceled' ? 'partner' : 'free';

export const isProduct = (v: string | null | undefined): v is Product =>
  v === 'api_starter' || v === 'api_pro' || v === 'embed_partner';

export const isInterval = (v: string | null | undefined): v is BillingInterval => v === 'month' || v === 'year';

/** Does the account already reflect a purchased product? */
export function hasProduct(a: DashAccount, product: Product): boolean {
  if (product === 'embed_partner') return effectiveEmbedPlan(a) === 'partner';
  if (product === 'api_pro') return a.apiTier === 'pro';
  return a.apiTier === 'starter';
}

/** Everything a checkout or plan switch can change — compared before/after to know when the webhook landed. */
export function planSnapshot(a: DashAccount): string {
  return [a.apiTier, a.apiInterval ?? '', a.apiCancelAtPeriodEnd ? 1 : 0, effectiveEmbedPlan(a), a.embedInterval ?? '', a.embedCancelAtPeriodEnd ? 1 : 0].join('|');
}
