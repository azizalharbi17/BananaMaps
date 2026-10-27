// POST /api/billing/portal → { url } — Stripe customer portal (payment method,
// invoices, cancel at period end). Takes no body. 400 no_customer until the
// account has subscribed to something at least once.
import type { NextRequest } from 'next/server';
import { getAccount } from '@/lib/dev/accounts';
import { billingConfigured, createPortalSession } from '@/lib/billing/stripe';
import { fail, fromError, json, requestOrigin, withUser } from '../../dev/_http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await withUser(req);
  if ('response' in auth) return auth.response;
  if (!billingConfigured()) return fail('billing_unavailable', 'Billing is not available right now. Try again later.', 503);
  try {
    const account = await getAccount(auth.user.id);
    if (!account?.stripe_customer_id) return fail('no_customer', 'There is no billing account yet. Subscribe to a paid plan first.', 400);
    const url = await createPortalSession(account.stripe_customer_id, requestOrigin(req));
    return json({ url });
  } catch (e) {
    return fromError(e, 'billing/portal');
  }
}
