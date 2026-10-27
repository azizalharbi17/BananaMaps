// Stripe integration: Checkout for new subscriptions, the customer portal for
// changes/cancellation, and webhook handling that mirrors subscription state
// into api_accounts. Products are matched by price lookup key
// (`api_starter_month`, `embed_partner_year`, …), created by scripts/stripe-setup.mjs,
// so no price ids live in config. Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
import Stripe from 'stripe';
import { serviceDb } from '../serverDb';
import { lookupKey, parseLookupKey, type BillingInterval, type Product } from '../plans';

let client: Stripe | null | undefined;
export function stripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  client = key ? new Stripe(key) : null; // the SDK's pinned API version keeps types and responses in step
  return client;
}

export const billingConfigured = () => !!process.env.STRIPE_SECRET_KEY;

export function siteUrl(reqOrigin?: string | null): string {
  return process.env.NEXT_PUBLIC_SITE_URL || reqOrigin || 'https://www.bananamaps.io';
}

async function priceIdFor(s: Stripe, product: Product, interval: BillingInterval): Promise<string> {
  const key = lookupKey(product, interval);
  const prices = await s.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const p = prices.data[0];
  if (!p) throw new Error(`Stripe price with lookup key "${key}" not found — run scripts/stripe-setup.mjs`);
  return p.id;
}

export async function getOrCreateCustomer(userId: string, email: string, existingCustomerId: string | null): Promise<string> {
  const s = stripe();
  if (!s) throw new Error('Stripe is not configured');
  if (existingCustomerId) return existingCustomerId;
  const found = await s.customers.search({ query: `metadata['user_id']:'${userId}'`, limit: 1 }).catch(() => null);
  const customer = found?.data[0] || await s.customers.create({ email, metadata: { user_id: userId } });
  const sb = serviceDb();
  if (!sb) throw new Error('database unavailable');
  const { error } = await sb.from('api_accounts').update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() }).eq('user_id', userId);
  if (error) throw new Error(`could not link the Stripe customer: ${error.message}`);
  return customer.id;
}

export async function createCheckoutSession(opts: {
  userId: string; email: string; customerId: string | null; product: Product; interval: BillingInterval; origin: string | null;
}): Promise<string> {
  const s = stripe();
  if (!s) throw new Error('Stripe is not configured');
  const customer = await getOrCreateCustomer(opts.userId, opts.email, opts.customerId);
  const price = await priceIdFor(s, opts.product, opts.interval);
  const base = siteUrl(opts.origin);
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${base}/developers/dashboard?checkout=success&product=${opts.product}`,
    cancel_url: `${base}/developers/dashboard?checkout=canceled`,
    client_reference_id: opts.userId,
    subscription_data: { metadata: { user_id: opts.userId, product: opts.product } },
    metadata: { user_id: opts.userId, product: opts.product },
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
}

export async function createPortalSession(customerId: string, origin: string | null): Promise<string> {
  const s = stripe();
  if (!s) throw new Error('Stripe is not configured');
  const session = await s.billingPortal.sessions.create({ customer: customerId, return_url: `${siteUrl(origin)}/developers/dashboard` });
  return session.url;
}

// ---------- webhook ----------

export function constructEvent(payload: string, signature: string): Stripe.Event {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) throw new Error('Stripe webhook is not configured');
  return s.webhooks.constructEvent(payload, signature, secret);
}

type SubState = {
  product: Product; interval: BillingInterval; subscriptionId: string; customerId: string;
  status: Stripe.Subscription.Status; periodEnd: string | null; cancelAtPeriodEnd: boolean;
};

function subState(sub: Stripe.Subscription): SubState | null {
  const item = sub.items.data[0];
  const parsed = parseLookupKey(item?.price?.lookup_key);
  if (!parsed) return null;
  const periodEndSec = (item as any)?.current_period_end ?? (sub as any).current_period_end ?? null;
  return {
    product: parsed.product, interval: parsed.interval, subscriptionId: sub.id,
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    status: sub.status, periodEnd: periodEndSec ? new Date(periodEndSec * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  };
}

/**
 * Map a subscription's state onto the account row (api_* or embed_* columns).
 * Every database result is checked: a failed write throws so the webhook
 * answers 500 and Stripe retries, instead of consuming the event with the
 * account left on the wrong tier.
 */
export async function applySubscription(sub: Stripe.Subscription, deleted = false): Promise<void> {
  const st = subState(sub);
  if (!st) { console.warn('[billing] subscription without a known lookup key ignored:', sub.id); return; }
  const sb = serviceDb();
  if (!sb) throw new Error('database unavailable');
  const userId = sub.metadata?.user_id || null;
  // Find the account: by subscription metadata first, then by customer id.
  let q = sb.from('api_accounts').select('user_id, api_subscription_id, embed_subscription_id');
  q = userId ? q.eq('user_id', userId) : q.eq('stripe_customer_id', st.customerId);
  const { data: acct, error: selErr } = await q.maybeSingle();
  if (selErr) throw new Error(`account lookup failed: ${selErr.message}`);
  if (!acct) {
    if (userId) throw new Error(`no account for user ${userId} (subscription ${sub.id})`); // retried by Stripe; the row should exist
    console.warn('[billing] no account for customer of subscription', sub.id);
    return;
  }

  const active = !deleted && (st.status === 'active' || st.status === 'trialing' || st.status === 'past_due');
  const status = active ? (st.status === 'past_due' ? 'past_due' : 'active') : 'active'; // a closed subscription leaves a usable free account
  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  if (st.product === 'embed_partner') {
    if (acct.embed_subscription_id && acct.embed_subscription_id !== st.subscriptionId && !active) return; // a stale subscription closing must not touch a newer one
    patch = {
      embed_plan: active ? 'partner' : 'free', embed_status: status,
      embed_subscription_id: active ? st.subscriptionId : null, embed_interval: active ? st.interval : null,
      embed_period_end: active ? st.periodEnd : null, embed_cancel_at_period_end: active ? st.cancelAtPeriodEnd : false,
    };
  } else {
    if (acct.api_subscription_id && acct.api_subscription_id !== st.subscriptionId && !active) return;
    patch = {
      api_tier: active ? (st.product === 'api_pro' ? 'pro' : 'starter') : 'free', api_status: status,
      api_subscription_id: active ? st.subscriptionId : null, api_interval: active ? st.interval : null,
      api_period_end: active ? st.periodEnd : null, api_cancel_at_period_end: active ? st.cancelAtPeriodEnd : false,
    };
  }
  const { error: updErr, count } = await sb.from('api_accounts')
    .update({ ...patch, stripe_customer_id: st.customerId, updated_at: now }, { count: 'exact' })
    .eq('user_id', acct.user_id);
  if (updErr) throw new Error(`account update failed: ${updErr.message}`);
  if (!count) throw new Error(`account update matched no row for user ${acct.user_id}`);
}

/**
 * Claim an event id before handling it. Returns false when the event was
 * already processed. A claim whose handler never finished (process killed
 * mid-way: processed_at still null after a minute) is handed out again so
 * Stripe's retry is not mistaken for a duplicate.
 */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const sb = serviceDb();
  if (!sb) throw new Error('database unavailable');
  const { error } = await sb.from('billing_events').insert({ stripe_event_id: event.id, type: event.type });
  if (!error) return true;
  if (String(error.code) !== '23505') throw new Error(error.message);
  const { data, error: selErr } = await sb.from('billing_events').select('processed_at, created_at').eq('stripe_event_id', event.id).maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!data || data.processed_at) return false;
  const stale = Date.now() - new Date(data.created_at).getTime() > 60_000;
  if (!stale) return false; // still being handled by another request
  const { error: updErr } = await sb.from('billing_events').update({ created_at: new Date().toISOString() }).eq('stripe_event_id', event.id);
  if (updErr) throw new Error(updErr.message);
  return true;
}

export async function markEventProcessed(event: Stripe.Event): Promise<void> {
  const sb = serviceDb();
  if (!sb) return;
  await sb.from('billing_events').update({ processed_at: new Date().toISOString() }).eq('stripe_event_id', event.id);
}

/** Drop a claim after a failed handler so Stripe's retry is processed. Best effort. */
export async function releaseEvent(eventId: string): Promise<void> {
  try {
    const sb = serviceDb();
    if (sb) await sb.from('billing_events').delete().eq('stripe_event_id', eventId);
  } catch { /* the stale-claim rule in claimEvent covers this after a minute */ }
}

/**
 * Stripe does not guarantee delivery order, so every subscription event is
 * applied from the subscription's CURRENT state (re-fetched), never from the
 * event payload: a late "updated" after a "deleted" then sees status canceled.
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  const s = stripe();
  if (!s) throw new Error('Stripe is not configured');
  const applyLive = async (id: string) => {
    const live = await s.subscriptions.retrieve(id);
    await applySubscription(live, live.status === 'canceled' || live.status === 'incomplete_expired');
  };
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription' && session.subscription) {
        await applyLive(typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await applyLive((event.data.object as Stripe.Subscription).id);
      break;
    default:
      break; // invoices etc. are not needed: subscription status carries the state
  }
}
