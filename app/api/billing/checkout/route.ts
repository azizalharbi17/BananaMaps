// POST /api/billing/checkout { product, interval } → { url }
// Opens Stripe Checkout for a new subscription. When the account already holds a
// live subscription in that product family (API tiers, or Embed), the existing
// subscription is switched to the requested price instead (prorated) — never a
// second subscription — and `url` points back at the dashboard.
import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { getAccount } from '@/lib/dev/accounts';
import { billingConfigured, createCheckoutSession, siteUrl, stripe } from '@/lib/billing/stripe';
import { PRODUCT_LABEL, lookupKey, type BillingInterval, type Product } from '@/lib/plans';
import { fail, fromError, json, readJsonObject, requestOrigin, withUser } from '../../dev/_http';

export const runtime = 'nodejs';

const PRODUCTS: readonly Product[] = ['api_starter', 'api_pro', 'embed_partner'];
const INTERVALS: readonly BillingInterval[] = ['month', 'year'];
const isProduct = (v: unknown): v is Product => typeof v === 'string' && (PRODUCTS as readonly string[]).includes(v);
const isInterval = (v: unknown): v is BillingInterval => typeof v === 'string' && (INTERVALS as readonly string[]).includes(v);

export async function POST(req: NextRequest) {
  const auth = await withUser(req);
  if ('response' in auth) return auth.response;
  const parsed = await readJsonObject(req);
  if ('response' in parsed) return parsed.response;
  const { product, interval } = parsed.body;
  if (!isProduct(product)) return fail('bad_request', `product must be one of: ${PRODUCTS.join(', ')}.`, 400);
  if (!isInterval(interval)) return fail('bad_request', `interval must be one of: ${INTERVALS.join(', ')}.`, 400);
  if (!billingConfigured()) return fail('billing_unavailable', 'Billing is not available right now. Try again later.', 503);

  try {
    const account = await getAccount(auth.user.id);
    if (!account) return fail('no_account', 'Open the developer dashboard first to set up your account.', 404);
    const origin = requestOrigin(req);

    const existingId = product === 'embed_partner' ? account.embed_subscription_id : account.api_subscription_id;
    if (existingId) {
      const result = await switchSubscription(existingId, product, interval);
      if (result === 'same') return fail('already_subscribed', `You are already on ${PRODUCT_LABEL[product]} (${interval === 'year' ? 'yearly' : 'monthly'}). Manage it in the billing portal.`, 409);
      if (result === 'updated') return json({ url: `${siteUrl(origin)}/developers/dashboard?checkout=success&product=${product}`, updated: true });
      // 'gone': the recorded subscription is no longer live in Stripe — fall through to a fresh Checkout.
    }

    const url = await createCheckoutSession({
      userId: account.user_id,
      email: account.email || auth.user.email,
      customerId: account.stripe_customer_id,
      product,
      interval,
      origin,
    });
    return json({ url });
  } catch (e) {
    return fromError(e, 'billing/checkout');
  }
}

/**
 * Move a live subscription to another price in the same family (Starter ↔ Pro,
 * month ↔ year). The webhook's customer.subscription.updated then mirrors the new
 * tier onto the account. A canceled-at-period-end subscription asked for again at
 * the same price is simply resumed.
 */
async function switchSubscription(subscriptionId: string, product: Product, interval: BillingInterval): Promise<'same' | 'updated' | 'gone'> {
  const s = stripe();
  if (!s) throw new Error('Stripe is not configured');
  let sub: Stripe.Subscription;
  try {
    sub = await s.subscriptions.retrieve(subscriptionId);
  } catch (e) {
    // Only a subscription Stripe no longer knows is "gone"; a transient error must
    // not open a second Checkout (= a second live subscription for the same customer).
    if (e instanceof Stripe.errors.StripeInvalidRequestError && e.code === 'resource_missing') return 'gone';
    throw e;
  }
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') return 'gone';
  const item = sub.items.data[0];
  if (!item) return 'gone';

  const key = lookupKey(product, interval);
  if (item.price?.lookup_key === key) {
    if (!sub.cancel_at_period_end) return 'same';
    await s.subscriptions.update(sub.id, { cancel_at_period_end: false });
    return 'updated';
  }
  const prices = await s.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`Stripe price with lookup key "${key}" not found — run scripts/stripe-setup.mjs`);
  await s.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: price.id }],
    proration_behavior: 'create_prorations',
    cancel_at_period_end: false,
    metadata: { ...sub.metadata, product },
  });
  return 'updated';
}
