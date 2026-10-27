// Shared plumbing for the developer-dashboard and billing routes (/api/dev/**,
// /api/billing/**). These are internal, session-authenticated routes: the browser
// sends its Supabase access token and the route acts through the service role.
// They never go through metered API keys, so public-API quotas are untouched.
//
// Conventions: every response is JSON with `Cache-Control: no-store`; errors are
// `{ error: { code, message } }` with the HTTP status; payloads are camelCase and
// never include key hashes or clear-text keys (except the one-time `key` fields
// returned by the routes that create a key).
import { NextRequest, NextResponse } from 'next/server';
import { DevError, type AccountRow, type KeyRow, type PartnerRow } from '@/lib/dev/accounts';
import { requireDevUser, type DevUser } from '@/lib/dev/session';
import type { EmbedPlan } from '@/lib/plans';

const NO_STORE: Record<string, string> = { 'Cache-Control': 'no-store' };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function fail(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

/** Verify the Supabase session; a failure comes back as a ready-to-send response. */
export async function withUser(req: NextRequest): Promise<{ user: DevUser } | { response: NextResponse }> {
  const r = await requireDevUser(req);
  if ('error' in r) return { response: fail(r.status === 401 ? 'unauthorized' : 'server_error', r.error, r.status) };
  return { user: r.user };
}

/**
 * Map a thrown error to a response. DevError carries its own status and code;
 * anything else becomes a 500 and only its message is logged (never a body).
 */
export function fromError(e: unknown, where: string) {
  if (e instanceof DevError) return fail(e.code, e.message, e.status);
  console.error(`[${where}]`, e instanceof Error ? e.message : String(e));
  return fail('server_error', 'Something went wrong on our side. Try again shortly.', 500);
}

/** Dashboard bodies are tiny ({ name }, { domains }); anything bigger is not ours. */
export const MAX_BODY_BYTES = 8 * 1024;

/**
 * Read a small JSON object body. A non-JSON content type, an oversized payload,
 * invalid JSON or a non-object value are rejected with 400. An empty body is `{}`
 * so optional-field routes keep working.
 */
export async function readJsonObject(req: NextRequest, maxBytes = MAX_BODY_BYTES): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type && type !== 'application/json') return { response: fail('bad_request', 'Send a JSON body (Content-Type: application/json).', 400) };
  const declared = Number(req.headers.get('content-length'));
  if (declared > maxBytes) return { response: fail('bad_request', `Request body too large (max ${maxBytes} bytes).`, 400) };
  let text: string;
  try { text = await req.text(); } catch { return { response: fail('bad_request', 'Could not read the request body.', 400) }; }
  if (Buffer.byteLength(text) > maxBytes) return { response: fail('bad_request', `Request body too large (max ${maxBytes} bytes).`, 400) };
  if (!text.trim()) return { body: {} };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { response: fail('bad_request', 'Body is not valid JSON.', 400) }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { response: fail('bad_request', 'Body must be a JSON object.', 400) };
  return { body: parsed as Record<string, unknown> };
}

/** Origin for Stripe return URLs: the browser's Origin header, else the request host. NEXT_PUBLIC_SITE_URL overrides it downstream. */
export function requestOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin');
  if (origin && /^https?:\/\/[^/]+$/i.test(origin)) return origin;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (!host) return null;
  const proto = req.headers.get('x-forwarded-proto') || (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Public Embed partner ids (`bme_…`), same rule as getPartnerConfig. */
export const PID_RE = /^bme_[A-Za-z0-9]{8,16}$/;

/** Effective Embed plan: a canceled Partner subscription gets free-plan features (matches getPartnerConfig). */
export const effectiveEmbedPlan = (a: AccountRow): EmbedPlan =>
  a.embed_plan === 'partner' && a.embed_status !== 'canceled' ? 'partner' : 'free';

// ---------- payload shaping ----------

export function shapeAccount(a: AccountRow) {
  return {
    email: a.email,
    apiTier: a.api_tier,
    apiStatus: a.api_status,
    apiInterval: a.api_interval,
    apiPeriodEnd: a.api_period_end,
    apiCancelAtPeriodEnd: !!a.api_cancel_at_period_end,
    apiSubscriptionId: a.api_subscription_id,
    embedPlan: a.embed_plan,
    embedStatus: a.embed_status,
    embedInterval: a.embed_interval,
    embedPeriodEnd: a.embed_period_end,
    embedCancelAtPeriodEnd: !!a.embed_cancel_at_period_end,
    embedSubscriptionId: a.embed_subscription_id,
    hasCustomer: !!a.stripe_customer_id,
    acceptedTermsAt: a.accepted_terms_at,
    createdAt: a.created_at,
  };
}

export function shapeKey(k: KeyRow, calls = 0) {
  return { id: k.id, prefix: k.prefix, name: k.name, status: k.status, createdAt: k.created_at, lastUsedAt: k.last_used_at, calls };
}

export function shapePartner(p: PartnerRow) {
  return { pid: p.pid, name: p.name, domains: p.domains || [], accent: p.accent, badge: !!p.badge, status: p.status, createdAt: p.created_at };
}
