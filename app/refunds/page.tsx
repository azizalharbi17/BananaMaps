// DRAFT — generated, not reviewed by a lawyer; review before launch.
//
// Refunds & Cancellation Policy for the paid BananaMaps API plans (Starter,
// Pro) and the BananaMaps Embed Partner plan. Subscriptions are billed by
// Stripe; cancellation happens in the Stripe customer portal reached from the
// developer dashboard.
import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { LEGAL_LAST_UPDATED, SUPPORT_EMAIL, type LegalSection } from '../legal/LegalPage';

const SUMMARY =
  'How to cancel a BananaMaps API or BananaMaps Embed subscription, what happens to your access and quota when you do, and when we refund a payment.';

export const metadata: Metadata = {
  title: 'Refunds & Cancellation — BananaMaps',
  description: SUMMARY,
};

const SECTIONS: LegalSection[] = [
  {
    id: 'scope',
    title: 'What this policy covers',
    body: (
      <>
        <p>
          This policy applies to the paid plans sold on <Link href="/developers">bananamaps.io/developers</Link>: BananaMaps API
          Starter and Pro, and BananaMaps Embed Partner, each billed monthly or yearly through Stripe. It is part of our{' '}
          <Link href="/terms">Terms of Service</Link>. If anything here conflicts with a mandatory consumer right where you
          live, that right wins.
        </p>
      </>
    ),
  },
  {
    id: 'cancel',
    title: 'Cancel any time',
    body: (
      <>
        <p>
          You can cancel from your <Link href="/developers/dashboard">developer dashboard</Link> — the “Manage billing” button
          opens the Stripe billing portal, where you can cancel, switch between monthly and yearly, or update your card. No
          email, no phone call, no retention hoops.
        </p>
        <ul>
          <li>Cancellation takes effect at the <strong>end of the period you’ve already paid for</strong>.</li>
          <li>You keep your plan’s quota, rate limit and Embed features until then.</li>
          <li>You won’t be charged again.</li>
          <li>You can undo a cancellation from the same portal any time before the period ends.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'period-end',
    title: 'What happens when a paid period ends',
    body: (
      <>
        <p>When a cancelled subscription reaches the end of its period, your account moves to the Free plan automatically:</p>
        <ul>
          <li>
            <strong>API keys keep working</strong>, but your monthly quota and per-minute limit drop to the Free plan’s
            immediately. If you have already used more this month than the Free plan allows, calls return{' '}
            <code>429 quota_exceeded</code> until the month resets or you subscribe again.
          </li>
          <li>
            <strong>Embed Partner features switch off</strong>: the “Powered by BananaMaps” badge returns and custom accent
            colours revert to the default. Your partner key and registered domains stay, so the maps keep loading.
          </li>
          <li>Your usage history and keys are kept, so re-subscribing later restores the paid limits instantly.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'partial',
    title: 'No refunds for partial periods',
    body: (
      <>
        <p>
          Because access continues to the end of the paid period, we don’t refund the unused part of a month or year when
          you cancel, except where the law requires it. Cancelling on day 3 of a monthly plan still gives you the remaining
          27 days.
        </p>
      </>
    ),
  },
  {
    id: 'guarantee',
    title: 'First-payment guarantee (7 days)',
    body: (
      <>
        <div className="legal-callout">
          <div className="legal-callout-label">Our promise</div>
          <p>
            If the BananaMaps API or BananaMaps Embed didn’t work for you, email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> within <strong>7 days of your first payment</strong> and
            we’ll refund that payment in full and cancel the subscription.
          </p>
        </div>
        <ul>
          <li>Applies to the first payment of your first subscription to each product (API or Embed), monthly or yearly.</li>
          <li>Renewals and later subscriptions are not covered.</li>
          <li>We may ask what went wrong so we can fix it, but the refund doesn’t depend on your answer.</li>
          <li>Refunds go back to the original payment method through Stripe and usually appear within 5–10 business days.</li>
          <li>Accounts refunded under this guarantee return to the Free plan immediately.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'annual',
    title: 'Annual plans',
    body: (
      <>
        <p>
          Yearly plans cost ten months’ price for twelve months of access. They work like monthly plans: cancel any time,
          keep access to the end of the year you paid for, and the 7-day first-payment guarantee applies. After those 7 days
          we don’t refund the unused months, except where the law requires it. Switching between yearly and monthly from
          the dashboard takes effect immediately; Stripe prorates the difference on your next invoice.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Upgrades, downgrades and quotas',
    body: (
      <>
        <ul>
          <li>
            <strong>Upgrades</strong> (Free → Starter, Starter → Pro, Embed Free → Partner) take effect immediately. Your new
            quota applies right away and Stripe shows any prorated amount before you confirm.
          </li>
          <li>
            <strong>Downgrades</strong> between paid plans (Pro → Starter) made from the dashboard take effect immediately
            and Stripe credits the unused part of the higher plan against your next invoice. Dropping a paid plan to Free is
            a cancellation: you keep the paid quota until the end of the period you already paid for.
          </li>
          <li>
            <strong>Quota is not refundable.</strong> Unused calls don’t roll over to the next month, and there is no credit for
            calls you didn’t make.
          </li>
          <li>
            <strong>No overage charges.</strong> We never bill you for going over your quota; the API simply returns{' '}
            <code>429</code> until the period resets or you upgrade.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'failed-payments',
    title: 'Failed payments',
    body: (
      <>
        <p>
          If a renewal payment fails, Stripe emails you and retries over the following days. If payment can’t be collected,
          the subscription is cancelled and your account moves to the Free plan. You are never charged for a period we
          couldn’t collect, and you can start a new subscription whenever you like.
        </p>
      </>
    ),
  },
  {
    id: 'chargebacks',
    title: 'Chargebacks and disputes',
    body: (
      <>
        <p>
          Please contact us before disputing a charge with your bank — we can usually resolve it the same day, and a direct
          refund reaches you faster than a chargeback. If a dispute is opened without contacting us, we may suspend the
          account and its keys while it is reviewed, and we will provide Stripe with our usage and account records. Accounts
          with chargebacks we consider abusive may be closed.
        </p>
      </>
    ),
  },
  {
    id: 'free',
    title: 'The Free plan',
    body: (
      <>
        <p>
          The Free plans for the BananaMaps API and BananaMaps Embed have no payment, no renewal and nothing to cancel. You can
          revoke keys from your dashboard at any time. If you’d like your account and data deleted, email us from the address
          on your account — see the <Link href="/privacy">Privacy Policy</Link> for how deletion works.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'How to reach us',
    body: (
      <>
        <p>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — write from the email on your account and include the product
          (API or Embed) and roughly when you paid. We aim to reply within two business days.
        </p>
      </>
    ),
  },
];

export default function RefundsPage() {
  return (
    <LegalPage
      slug="refunds"
      title="Refunds & Cancellation"
      summary={SUMMARY}
      lastUpdated={LEGAL_LAST_UPDATED}
      effectiveNote={`${LEGAL_LAST_UPDATED}. Applies to every subscription started or renewed on or after that date.`}
      intro={
        <div className="legal-callout">
          <div className="legal-callout-label">Short version</div>
          <p>
            Cancel any time from the billing portal; you keep access until the end of what you paid for. We don’t refund partial
            periods, but if the product didn’t work for you, tell us within 7 days of your first payment and we’ll refund it in
            full. There is no overage billing, ever.
          </p>
        </div>
      }
      sections={SECTIONS}
    />
  );
}
