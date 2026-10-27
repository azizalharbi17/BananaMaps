// Developer accounts, API keys, usage and Embed partners — the data layer used
// by the dashboard routes (service role; callers verify the user first with
// requireDevUser). Keys are returned in clear exactly once, at creation.
import { randomBytes } from 'node:crypto';
import { serviceDb, hasServiceKey } from '../serverDb';
import { generateKey } from '../api/auth';
import { apiPlan, type ApiTier, type EmbedPlan } from '../plans';
import { isDisposableEmail } from './disposableDomains';
import type { DevUser } from './session';

export class DevError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); }
}

/** Accounts a single IP may create per 24 h before signups from it are refused. */
export const SIGNUPS_PER_IP_PER_DAY = Number(process.env.SIGNUPS_PER_IP_PER_DAY) > 0 ? Number(process.env.SIGNUPS_PER_IP_PER_DAY) : 3;
export const MAX_KEYS_PER_ACCOUNT = 5;
export const MAX_PARTNERS_PER_ACCOUNT = 5;

export interface AccountRow {
  user_id: string;
  email: string;
  api_tier: ApiTier;
  api_status: string;
  api_subscription_id: string | null;
  api_interval: string | null;
  api_period_end: string | null;
  api_cancel_at_period_end: boolean;
  embed_plan: EmbedPlan;
  embed_status: string;
  embed_subscription_id: string | null;
  embed_interval: string | null;
  embed_period_end: string | null;
  embed_cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  accepted_terms_at: string | null;
  created_at: string;
}

export interface KeyRow {
  id: string;
  prefix: string;
  name: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface PartnerRow {
  pid: string;
  name: string;
  domains: string[];
  accent: string | null;
  badge: boolean;
  status: string;
  created_at: string;
}

function db() {
  const sb = hasServiceKey() ? serviceDb() : null;
  if (!sb) throw new DevError('The service is temporarily unavailable. Try again shortly.', 503, 'unavailable');
  return sb;
}

export const currentPeriod = () => new Date().toISOString().slice(0, 7);

/**
 * Load the account row, creating it on first visit. Creation is where the abuse
 * rules apply: confirmed email, no disposable domains, a per-IP daily cap. The
 * first API key is issued with the account so a verified signup is immediately
 * usable ("instant free key").
 */
export async function ensureAccount(user: DevUser, ip: string): Promise<{ account: AccountRow; firstKey: string | null }> {
  const sb = db();
  const { data: existing, error } = await sb.from('api_accounts').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw new DevError('Could not load your account.', 500, 'db');
  if (existing) return { account: existing as AccountRow, firstKey: null };

  if (!user.emailConfirmed) throw new DevError('Confirm your email address first (check your inbox), then reload this page.', 403, 'email_unconfirmed');
  if (isDisposableEmail(user.email)) throw new DevError('Disposable email addresses cannot get a free API key. Sign up with a regular email address.', 403, 'disposable_email');

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await sb.from('signup_events').select('*', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
  if ((count || 0) >= SIGNUPS_PER_IP_PER_DAY) throw new DevError('Too many accounts were created from your network today. Try again tomorrow or contact support.', 429, 'signup_rate_limited');

  // Acceptance is stamped server-side at creation (the ToS checkbox is required
  // to sign up at all); the signup metadata is informational only.
  const { data: created, error: insErr } = await sb.from('api_accounts').insert({
    user_id: user.id, email: user.email, accepted_terms_at: new Date().toISOString(), signup_ip: ip,
  }).select('*').single();
  if (insErr) {
    // Two first visits at once (React strict mode, a double click): the other
    // request created the row and issued the first key — hand back the row only.
    if (String(insErr.code) === '23505') {
      const { data: row } = await sb.from('api_accounts').select('*').eq('user_id', user.id).maybeSingle();
      if (row) return { account: row as AccountRow, firstKey: null };
    }
    throw new DevError('Could not create your account.', 500, 'db');
  }
  if (!created) throw new DevError('Could not create your account.', 500, 'db');
  await sb.from('signup_events').insert({ ip, email: user.email, user_id: user.id });
  const key = await createKey(user.id, 'Default');
  return { account: created as AccountRow, firstKey: key.key };
}

export async function getAccount(userId: string): Promise<AccountRow | null> {
  const { data, error } = await db().from('api_accounts').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new DevError('Could not load your account.', 500, 'db');
  return (data as AccountRow) || null;
}

export async function listKeys(userId: string): Promise<KeyRow[]> {
  const { data, error } = await db().from('api_keys')
    .select('id, prefix, name, status, created_at, last_used_at, revoked_at')
    .eq('account_id', userId).order('created_at', { ascending: true });
  if (error) throw new DevError('Could not load your keys.', 500, 'db');
  return (data || []) as KeyRow[];
}

export async function createKey(userId: string, name: string): Promise<{ key: string; row: KeyRow }> {
  const sb = db();
  const { count } = await sb.from('api_keys').select('*', { count: 'exact', head: true }).eq('account_id', userId).eq('status', 'active');
  if ((count || 0) >= MAX_KEYS_PER_ACCOUNT) throw new DevError(`You can have up to ${MAX_KEYS_PER_ACCOUNT} active keys. Revoke one first.`, 400, 'too_many_keys');
  const gen = generateKey();
  const cleanName = (name || 'Default').trim().slice(0, 40) || 'Default';
  const { data, error } = await sb.from('api_keys')
    .insert({ account_id: userId, key_hash: gen.hash, prefix: gen.prefix, name: cleanName })
    .select('id, prefix, name, status, created_at, last_used_at, revoked_at').single();
  if (error || !data) throw new DevError('Could not create the key.', 500, 'db');
  return { key: gen.key, row: data as KeyRow };
}

export async function revokeKey(userId: string, keyId: string): Promise<void> {
  const { error, count } = await db().from('api_keys')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', keyId).eq('account_id', userId).eq('status', 'active');
  if (error) throw new DevError('Could not revoke the key.', 500, 'db');
  if (!count) throw new DevError('Key not found.', 404, 'not_found');
}

export async function renameKey(userId: string, keyId: string, name: string): Promise<void> {
  const cleanName = name.trim().slice(0, 40);
  if (!cleanName) throw new DevError('Give the key a name.', 400, 'bad_request');
  const { error, count } = await db().from('api_keys').update({ name: cleanName }, { count: 'exact' }).eq('id', keyId).eq('account_id', userId);
  if (error) throw new DevError('Could not rename the key.', 500, 'db');
  if (!count) throw new DevError('Key not found.', 404, 'not_found');
}

export interface UsageSummary {
  period: string;
  used: number;
  quota: number;
  perMinute: number;
  resetsAt: string;
  byKey: Record<string, number>;
}

export async function usageThisMonth(userId: string, tier: ApiTier): Promise<UsageSummary> {
  const period = currentPeriod();
  const sb = db();
  const [{ data, error }, limits] = await Promise.all([
    sb.rpc('api_usage_summary', { p_account: userId, p_period: period }),
    // The enforced limits live in api_tiers (editable without a deploy); plans.ts is the fallback.
    sb.from('api_tiers').select('monthly_quota, per_minute').eq('tier', tier).maybeSingle(),
  ]);
  if (error) throw new DevError('Could not load usage.', 500, 'db');
  const byKey: Record<string, number> = {};
  let used = 0;
  for (const r of (data || []) as { key_id: string; calls: number }[]) { byKey[r.key_id] = Number(r.calls) || 0; used += Number(r.calls) || 0; }
  const plan = apiPlan(tier);
  const quota = Number(limits.data?.monthly_quota) || plan.monthlyQuota;
  const perMinute = Number(limits.data?.per_minute) || plan.perMinute;
  const now = new Date();
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  return { period, used, quota, perMinute, resetsAt, byKey };
}

// ---------- BananaMaps Embed partners ----------

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;
const HOST_RE = /^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$|^localhost$/i;

/** Normalize a domain list; an entry that is not a hostname is an error, never silently dropped (an empty list means "any site"). */
function cleanDomains(domains: unknown): string[] {
  if (domains === undefined || domains === null) return [];
  if (!Array.isArray(domains)) throw new DevError('domains must be a list of hostnames.', 400, 'bad_request');
  const out: string[] = [];
  for (const d of domains) {
    const raw = String(d || '').trim();
    if (!raw) continue;
    const h = raw.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!HOST_RE.test(h)) throw new DevError(`"${raw}" is not a hostname. Use example.com or *.example.com (no ports, paths or IP addresses).`, 400, 'bad_request');
    if (!out.includes(h)) out.push(h);
    if (out.length > 10) throw new DevError('Up to 10 domains per site.', 400, 'bad_request');
  }
  return out;
}

export async function listPartners(userId: string): Promise<PartnerRow[]> {
  const { data, error } = await db().from('embed_partners')
    .select('pid, name, domains, accent, badge, status, created_at')
    .eq('account_id', userId).order('created_at', { ascending: true });
  if (error) throw new DevError('Could not load your Embed settings.', 500, 'db');
  return (data || []) as PartnerRow[];
}

export async function createPartner(userId: string, input: { name?: string; domains?: unknown }): Promise<PartnerRow> {
  const sb = db();
  const { count } = await sb.from('embed_partners').select('*', { count: 'exact', head: true }).eq('account_id', userId).eq('status', 'active');
  if ((count || 0) >= MAX_PARTNERS_PER_ACCOUNT) throw new DevError(`You can have up to ${MAX_PARTNERS_PER_ACCOUNT} Embed sites.`, 400, 'too_many_partners');
  const pid = 'bme_' + randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).padEnd(12, 'x');
  const name = String(input.name || 'My site').trim().slice(0, 60) || 'My site';
  const { data, error } = await sb.from('embed_partners')
    .insert({ pid, account_id: userId, name, domains: cleanDomains(input.domains) })
    .select('pid, name, domains, accent, badge, status, created_at').single();
  if (error || !data) throw new DevError('Could not create the Embed site.', 500, 'db');
  return data as PartnerRow;
}

/** Update a partner; badge-off and accent color only take effect on the partner plan. */
export async function updatePartner(userId: string, pid: string, input: { name?: string; domains?: unknown; accent?: string | null; badge?: boolean }, plan: EmbedPlan): Promise<PartnerRow> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = String(input.name).trim().slice(0, 60) || 'My site';
  if (input.domains !== undefined) patch.domains = cleanDomains(input.domains);
  if (input.accent !== undefined) {
    if (input.accent === null || input.accent === '') patch.accent = null;
    else if (!HEX_RE.test(input.accent)) throw new DevError('Accent must be a 6-digit hex color like #F5C842.', 400, 'bad_request');
    else if (plan !== 'partner') throw new DevError('Custom accent colors are part of the Partner plan.', 402, 'plan_required');
    else patch.accent = '#' + input.accent.replace('#', '').toUpperCase();
  }
  if (input.badge !== undefined) {
    if (input.badge === false && plan !== 'partner') throw new DevError('Removing the badge is part of the Partner plan.', 402, 'plan_required');
    patch.badge = !!input.badge;
  }
  const { data, error } = await db().from('embed_partners').update(patch).eq('pid', pid).eq('account_id', userId)
    .select('pid, name, domains, accent, badge, status, created_at').maybeSingle();
  if (error) throw new DevError('Could not update the Embed site.', 500, 'db');
  if (!data) throw new DevError('Embed site not found.', 404, 'not_found');
  return data as PartnerRow;
}

export async function revokePartner(userId: string, pid: string): Promise<void> {
  const { error, count } = await db().from('embed_partners').update({ status: 'revoked', updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('pid', pid).eq('account_id', userId);
  if (error) throw new DevError('Could not remove the Embed site.', 500, 'db');
  if (!count) throw new DevError('Embed site not found.', 404, 'not_found');
}

export interface PartnerConfig {
  pid: string;
  plan: EmbedPlan;
  domains: string[];
  accent: string | null;
  /** Whether the "Powered by BananaMaps" badge must be shown. */
  badge: boolean;
}

const partnerMemo: Map<string, { at: number; cfg: PartnerConfig | null }> = ((globalThis as any).__embedPartnerMemo ||= new Map());
const PARTNER_MEMO_MS = 60_000;

/** Resolve a public partner id for the Embed page. Plan features are gated by the owner's current Embed plan. Cached 60 s. */
export async function getPartnerConfig(pid: string): Promise<PartnerConfig | null> {
  if (!/^bme_[A-Za-z0-9]{8,16}$/.test(pid)) return null;
  const hit = partnerMemo.get(pid);
  if (hit && Date.now() - hit.at < PARTNER_MEMO_MS) return hit.cfg;
  let cfg: PartnerConfig | null = null;
  let answered = false; // only a real lookup result is memoized; a store failure is retried on the next request
  try {
    const sb = hasServiceKey() ? serviceDb() : null;
    if (sb) {
      const { data, error } = await sb.from('embed_partners')
        .select('pid, domains, accent, badge, status, account:api_accounts!inner(embed_plan, embed_status)')
        .eq('pid', pid).maybeSingle();
      if (!error) {
        answered = true;
        const acct = (data as any)?.account;
        if (data && data.status === 'active' && acct) {
          const plan: EmbedPlan = acct.embed_plan === 'partner' && acct.embed_status !== 'canceled' ? 'partner' : 'free';
          cfg = { pid: data.pid, plan, domains: data.domains || [], accent: plan === 'partner' ? data.accent : null, badge: plan === 'partner' ? !!data.badge : true };
        }
      }
    }
  } catch { cfg = null; }
  if (!answered) return hit?.cfg ?? null;
  partnerMemo.set(pid, { at: Date.now(), cfg });
  if (partnerMemo.size > 500) for (const [k, v] of partnerMemo) if (Date.now() - v.at >= PARTNER_MEMO_MS) partnerMemo.delete(k);
  return cfg;
}
