#!/usr/bin/env node
// One-time Stripe setup (idempotent). Creates the three products with monthly
// and yearly prices keyed by lookup key (see lib/plans.ts), configures the
// customer portal, and registers the webhook endpoint for the given site URL.
//
//   STRIPE_SECRET_KEY=sk_test_… node scripts/stripe-setup.mjs https://www.bananamaps.io
//
// Prints the webhook signing secret once (set it as STRIPE_WEBHOOK_SECRET). Run
// it again any time: existing prices/endpoints are reused, never duplicated.
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
const site = (process.argv[2] || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
if (!key) { console.error('STRIPE_SECRET_KEY is required'); process.exit(1); }
if (!site) { console.error('usage: node scripts/stripe-setup.mjs https://your-site'); process.exit(1); }
const stripe = new Stripe(key);
const mode = key.startsWith('sk_test_') ? 'TEST' : 'LIVE';

const PRODUCTS = [
  { product: 'api_starter', name: 'BananaMaps API Starter', description: '50,000 API calls per month, 120 per minute.', monthly: 4900, yearly: 49000 },
  { product: 'api_pro', name: 'BananaMaps API Pro', description: '500,000 API calls per month, 600 per minute.', monthly: 19900, yearly: 199000 },
  { product: 'embed_partner', name: 'BananaMaps Embed Partner', description: 'Badge optional, custom accent color, priority refresh.', monthly: 9900, yearly: 99000 },
];

async function ensureProduct(def) {
  const existing = await stripe.products.search({ query: `metadata['bm_product']:'${def.product}'`, limit: 1 });
  if (existing.data[0]) return existing.data[0];
  return stripe.products.create({ name: def.name, description: def.description, metadata: { bm_product: def.product } });
}

async function ensurePrice(product, lookup, amount, interval) {
  const found = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  const existing = found.data[0];
  if (existing) {
    if (existing.unit_amount === amount && existing.recurring?.interval === interval && existing.currency === 'usd') return existing;
    // The catalogue changed: a lookup key can only point at one active price, so
    // the old one is archived and a new one takes the key (existing subscriptions
    // keep their old price until switched).
    console.warn(`price ${lookup} changed (${existing.unit_amount} → ${amount}); archiving ${existing.id}`);
    await stripe.prices.update(existing.id, { active: false, lookup_key: `${lookup}_retired_${Date.now()}` });
  }
  return stripe.prices.create({
    product: product.id, currency: 'usd', unit_amount: amount, recurring: { interval }, lookup_key: lookup, transfer_lookup_key: true,
    nickname: `${product.name} (${interval}ly)`,
  });
}

async function ensurePortal() {
  const configs = await stripe.billingPortal.configurations.list({ limit: 1, is_default: true });
  const features = {
    customer_update: { enabled: true, allowed_updates: ['email', 'address'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] } },
  };
  if (configs.data[0]) {
    await stripe.billingPortal.configurations.update(configs.data[0].id, { features, business_profile: { headline: 'BananaMaps billing' } });
    return configs.data[0];
  }
  return stripe.billingPortal.configurations.create({ features, business_profile: { headline: 'BananaMaps billing' } });
}

async function ensureWebhook(url) {
  const events = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = list.data.find(e => e.url === url);
  if (existing) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: events, disabled: false });
    return { endpoint: existing, secret: null };
  }
  const created = await stripe.webhookEndpoints.create({ url, enabled_events: events, description: 'BananaMaps billing' });
  return { endpoint: created, secret: created.secret };
}

const out = { mode, prices: {} };
for (const def of PRODUCTS) {
  const product = await ensureProduct(def);
  const m = await ensurePrice(product, `${def.product}_month`, def.monthly, 'month');
  const y = await ensurePrice(product, `${def.product}_year`, def.yearly, 'year');
  out.prices[`${def.product}_month`] = m.id;
  out.prices[`${def.product}_year`] = y.id;
}
await ensurePortal();
const hook = await ensureWebhook(`${site}/api/billing/webhook`);
out.webhook = { id: hook.endpoint.id, url: hook.endpoint.url, status: hook.endpoint.status };
console.log(JSON.stringify(out, null, 2));
if (hook.secret) {
  console.log('\nSet this in your environment (shown once; an existing endpoint keeps its old secret):');
  console.log(`STRIPE_WEBHOOK_SECRET=${hook.secret}`);
} else {
  console.log('\nWebhook endpoint already existed; its signing secret is in the Stripe dashboard (Developers → Webhooks).');
}
