// Plan catalogue shared by the public API, billing, the developer portal and
// the marketing pages. Prices here are display values; Stripe prices are
// created from the same numbers by scripts/stripe-setup.mjs and matched back
// by `lookupKey` in the webhook, so nothing else needs a price id.

export type ApiTier = 'free' | 'starter' | 'pro';
export type EmbedPlan = 'free' | 'partner';
export type BillingInterval = 'month' | 'year';

export interface ApiPlan {
  tier: ApiTier;
  name: string;
  monthlyQuota: number;
  perMinute: number;
  /** USD per month; 0 = no card. */
  priceMonthly: number;
  /** USD per year (two months free). */
  priceYearly: number;
  blurb: string;
}

export const API_PLANS: ApiPlan[] = [
  { tier: 'free', name: 'Free', monthlyQuota: 1_000, perMinute: 30, priceMonthly: 0, priceYearly: 0, blurb: 'Try the API. No card required.' },
  { tier: 'starter', name: 'Starter', monthlyQuota: 50_000, perMinute: 120, priceMonthly: 49, priceYearly: 490, blurb: 'For bots, dashboards and small products.' },
  { tier: 'pro', name: 'Pro', monthlyQuota: 500_000, perMinute: 600, priceMonthly: 199, priceYearly: 1990, blurb: 'For production apps and data teams.' },
];

export const EMBED_PLANS: { plan: EmbedPlan; name: string; priceMonthly: number; priceYearly: number; features: string[] }[] = [
  { plan: 'free', name: 'Free', priceMonthly: 0, priceYearly: 0, features: ['Live holder maps on your site', '"Powered by BananaMaps" badge and link (required)', 'All supported chains'] },
  { plan: 'partner', name: 'Partner', priceMonthly: 99, priceYearly: 990, features: ['Badge optional', 'Custom accent color', 'Priority refresh of the maps your visitors open', 'Email support'] },
];

/** Stripe price lookup keys: `${product}_${interval}`. */
export type Product = 'api_starter' | 'api_pro' | 'embed_partner';
export const lookupKey = (product: Product, interval: BillingInterval) => `${product}_${interval}`;

export function parseLookupKey(key: string | null | undefined): { product: Product; interval: BillingInterval } | null {
  if (!key) return null;
  const m = key.match(/^(api_starter|api_pro|embed_partner)_(month|year)$/);
  return m ? { product: m[1] as Product, interval: m[2] as BillingInterval } : null;
}

export const apiPlan = (tier: string): ApiPlan => API_PLANS.find(p => p.tier === tier) || API_PLANS[0];

export const PRODUCT_LABEL: Record<Product, string> = {
  api_starter: 'BananaMaps API Starter',
  api_pro: 'BananaMaps API Pro',
  embed_partner: 'BananaMaps Embed Partner',
};

/** Hostnames whose pages may show BananaMaps Embed without a partner id. */
export const EMBED_FIRST_PARTY_HOSTS = ['bananamaps.io', 'bananascreener.io', 'localhost', '127.0.0.1'];

export function isFirstPartyHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return EMBED_FIRST_PARTY_HOSTS.some(d => h === d || h.endsWith('.' + d));
}
