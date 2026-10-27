// Public API authentication + metering. One database round trip per call:
// api_authorize() (SECURITY DEFINER, see supabase/migrations/20261027_monetization.sql)
// validates the key, checks the account, the month's quota and the per-minute
// limit, and counts the call. Keys are never logged or stored: only their SHA-256.
import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { serviceDb } from '../serverDb';
import { apiError } from './respond';
import { apiPlan } from '../plans';

export const KEY_PREFIX = 'bm_live_';
const KEY_RE = /^bm_live_[A-Za-z0-9]{32}$/;

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** Generate a new key: `bm_live_` + 32 base62 chars. Returned once; store only the hash + prefix. */
export function generateKey(): { key: string; hash: string; prefix: string } {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(48);
  let body = '';
  for (let i = 0; body.length < 32 && i < bytes.length; i++) body += alphabet[bytes[i] % alphabet.length];
  const key = KEY_PREFIX + body;
  return { key, hash: hashKey(key), prefix: key.slice(0, 12) };
}

export interface ApiAuth {
  accountId: string;
  keyId: string;
  tier: string;
  monthlyUsed: number;
  monthlyQuota: number;
  minuteUsed: number;
  perMinute: number;
  period: string;
  periodEnd: string;
}

function rateHeaders(a: Partial<ApiAuth>): Record<string, string> {
  const h: Record<string, string> = {};
  if (a.perMinute !== undefined) {
    h['X-RateLimit-Limit'] = String(a.perMinute);
    h['X-RateLimit-Remaining'] = String(Math.max(0, a.perMinute - (a.minuteUsed || 0)));
    h['X-RateLimit-Reset'] = String(Math.ceil(Date.now() / 60_000) * 60); // epoch seconds, next minute
  }
  if (a.monthlyQuota !== undefined) {
    h['X-Quota-Limit'] = String(a.monthlyQuota);
    h['X-Quota-Used'] = String(a.monthlyUsed || 0);
    if (a.periodEnd) h['X-Quota-Reset'] = a.periodEnd;
  }
  return h;
}

/**
 * Authenticate a public API request. Returns either the authorized context or a
 * ready-to-send error response (401/403/429 with rate/quota headers).
 */
export async function authorizeApiRequest(req: NextRequest): Promise<{ auth: ApiAuth; headers: Record<string, string> } | { response: NextResponse }> {
  const header = req.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  const key = m?.[1]?.trim();
  if (!key) return { response: apiError('unauthorized', 'Send your API key as "Authorization: Bearer bm_live_…". Get a free key at https://www.bananamaps.io/developers.') };
  if (!KEY_RE.test(key)) return { response: apiError('invalid_key', 'That API key is not valid.') };

  const sb = serviceDb();
  if (!sb) return { response: apiError('server_error', 'The API is temporarily unavailable. Try again shortly.') };
  const { data, error } = await sb.rpc('api_authorize', { p_key_hash: hashKey(key) });
  if (error) {
    console.error('[v1] api_authorize failed:', error.message);
    return { response: apiError('server_error', 'The API is temporarily unavailable. Try again shortly.') };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { response: apiError('server_error', 'The API is temporarily unavailable. Try again shortly.') };

  const ctx: ApiAuth = {
    accountId: row.account_id, keyId: row.key_id, tier: row.tier || 'free',
    monthlyUsed: Number(row.monthly_used) || 0, monthlyQuota: Number(row.monthly_quota) || apiPlan(row.tier || 'free').monthlyQuota,
    minuteUsed: Number(row.minute_used) || 0, perMinute: Number(row.per_minute) || apiPlan(row.tier || 'free').perMinute,
    period: row.period, periodEnd: row.period_end,
  };
  const headers = rateHeaders(ctx);
  if (row.ok) return { auth: ctx, headers };

  switch (row.reason) {
    case 'invalid_key': return { response: apiError('invalid_key', 'That API key is not valid.') };
    case 'revoked': return { response: apiError('revoked_key', 'This API key was revoked. Create a new one in your dashboard.') };
    case 'account_canceled': return { response: apiError('account_canceled', 'This account is closed. Contact support if that is unexpected.') };
    case 'quota_exceeded': {
      const plan = apiPlan(ctx.tier);
      const upgrade = ctx.tier === 'pro' ? 'Your quota resets on ' + new Date(ctx.periodEnd).toUTCString() + '.' : `Upgrade at https://www.bananamaps.io/developers/dashboard for a higher quota, or wait for the reset on ${new Date(ctx.periodEnd).toUTCString()}.`;
      return { response: apiError('quota_exceeded', `Monthly quota of ${ctx.monthlyQuota.toLocaleString('en-US')} calls reached on the ${plan.name} plan. ${upgrade}`, { ...headers, 'Retry-After': String(Math.max(1, Math.round((new Date(ctx.periodEnd).getTime() - Date.now()) / 1000))) }) };
    }
    case 'rate_limited':
      return { response: apiError('rate_limited', `Rate limit of ${ctx.perMinute} calls per minute reached. Slow down or upgrade for a higher limit.`, { ...headers, 'Retry-After': String(60 - (Math.floor(Date.now() / 1000) % 60)) }) };
    default:
      return { response: apiError('unauthorized', 'This API key cannot be used.') };
  }
}
