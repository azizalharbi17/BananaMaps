// POST /api/billing/webhook — Stripe only. The raw body is verified against
// STRIPE_WEBHOOK_SECRET, the event id is claimed for idempotency, then the
// subscription state is mirrored onto api_accounts. A failing handler answers
// 500 (and releases the claim) so Stripe's retry gets processed. Logs carry
// only event ids and types.
import type { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { billingConfigured, claimEvent, constructEvent, handleWebhookEvent, markEventProcessed, releaseEvent } from '@/lib/billing/stripe';
import { fail, json } from '../../dev/_http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Stripe events are a few KB; anything near a megabyte is not one of ours. */
const MAX_EVENT_BYTES = 1024 * 1024;

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return fail('missing_signature', 'Missing stripe-signature header.', 400);

  const declared = Number(req.headers.get('content-length'));
  if (declared > MAX_EVENT_BYTES) return fail('bad_request', 'Payload too large.', 400);
  let raw: string;
  try { raw = await req.text(); } catch { return fail('bad_request', 'Could not read the payload.', 400); }
  if (!raw || Buffer.byteLength(raw) > MAX_EVENT_BYTES) return fail('bad_request', 'Payload missing or too large.', 400);

  if (!billingConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) return fail('billing_unavailable', 'Stripe webhook is not configured.', 503);

  let event: Stripe.Event;
  try {
    event = constructEvent(raw, signature);
  } catch {
    console.warn('[billing/webhook] signature verification failed');
    return fail('invalid_signature', 'Webhook signature verification failed.', 400);
  }

  let fresh: boolean;
  try {
    fresh = await claimEvent(event);
  } catch (e) {
    console.error('[billing/webhook] could not record event', event.type, event.id, e instanceof Error ? e.message : String(e));
    return fail('server_error', 'Could not record the event. Retry.', 500);
  }
  if (!fresh) return json({ received: true, duplicate: true });

  try {
    await handleWebhookEvent(event);
    await markEventProcessed(event);
    console.log('[billing/webhook] processed', event.type, event.id);
    return json({ received: true });
  } catch (e) {
    console.error('[billing/webhook] handler failed', event.type, event.id, e instanceof Error ? e.message : String(e));
    await releaseEvent(event.id);
    return fail('server_error', 'Event handling failed. Stripe will retry.', 500);
  }
}

