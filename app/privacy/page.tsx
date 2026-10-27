// DRAFT — generated, not reviewed by a lawyer; review before launch.
//
// Privacy Policy for bananamaps.io, the BananaMaps API and BananaMaps Embed.
// Covers GDPR / UK GDPR and CCPA/CPRA basics for the data we actually hold:
// account email, auth data (Supabase), per-key usage counts, signup IP and
// server logs, and Stripe billing references (never card numbers).
import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { LEGAL_LAST_UPDATED, SUPPORT_EMAIL, type LegalSection } from '../legal/LegalPage';

const SUMMARY =
  'What BananaMaps collects when you use the site, the BananaMaps API or BananaMaps Embed, why we collect it, how long we keep it, and the rights you have over it.';

export const metadata: Metadata = {
  title: 'Privacy Policy — BananaMaps',
  description: SUMMARY,
};

const SECTIONS: LegalSection[] = [
  {
    id: 'scope',
    title: 'Who we are and what this covers',
    body: (
      <>
        <p>
          BananaMaps (“we”, “us”) operates bananamaps.io, the BananaMaps app, the BananaMaps API and BananaMaps Embed (the
          “Service”). This policy explains how we handle personal data when you visit the site, hold an account, call the
          API, or view or publish BananaMaps Embed. For the purposes of the GDPR, we are the controller of the data described
          here. You can reach us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        <p>
          Public blockchain data — wallet addresses, balances and transfers — is processed by the Service too. It is public
          by design and is not linked by us to any account holder. This policy is about data that relates to you.
        </p>
      </>
    ),
  },
  {
    id: 'collect',
    title: 'Information we collect',
    body: (
      <>
        <h3>Account data</h3>
        <ul>
          <li>Your email address, whether it has been confirmed, and the time you accepted our Terms.</li>
          <li>
            Authentication data handled by Supabase Auth: a salted hash of your password (we never see the password itself),
            session tokens, and sign-in timestamps.
          </li>
        </ul>
        <h3>API and Embed usage</h3>
        <ul>
          <li>
            For each API key: its name, a one-way hash of the key (we don’t store the key in clear text after showing it to
            you once), when it was created and last used, and counts of calls per minute and per month with timestamps.
          </li>
          <li>For each partner key: the domains you register, your display settings, and request counts per domain.</li>
          <li>Our servers log request metadata — endpoint, status code, response time — to meter quotas and debug problems.</li>
        </ul>
        <h3>Abuse-prevention data</h3>
        <ul>
          <li>
            Your IP address when you create an account, used to enforce the per-network signup limit, and IP addresses in
            short-lived server logs for all requests.
          </li>
          <li>Your email domain, checked against a list of disposable-email providers before issuing a free key.</li>
        </ul>
        <h3>Billing data</h3>
        <ul>
          <li>
            Your Stripe customer ID, subscription IDs, plan, billing interval, period dates and a log of billing events we
            received from Stripe.
          </li>
          <li>
            Payment is handled by Stripe. Card numbers, expiry dates and security codes go straight to Stripe and{' '}
            <strong>we never see or store them</strong>. Stripe’s handling of your payment data is described in{' '}
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe’s Privacy Policy</a>.
          </li>
        </ul>
        <h3>Support</h3>
        <ul>
          <li>Emails you send us, and our replies.</li>
        </ul>
        <h3>What we don’t collect</h3>
        <ul>
          <li>We don’t ask you to connect a wallet or sign anything, and we don’t link wallet addresses to accounts.</li>
          <li>We don’t run advertising trackers or sell data to data brokers.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'use',
    title: 'How we use information',
    body: (
      <>
        <ul>
          <li><strong>Providing the Service</strong> — creating and securing your account, authenticating API and Embed requests, and serving data.</li>
          <li><strong>Metering and billing</strong> — counting calls against your quota and rate limit, charging subscriptions, sending receipts.</li>
          <li><strong>Preventing abuse</strong> — stopping key farming, scraping, credential stuffing and attacks on the Service.</li>
          <li><strong>Communicating</strong> — transactional email about confirmation, password resets, payments, quota and important changes. We don’t send marketing email unless you opt in.</li>
          <li><strong>Improving the Service</strong> — aggregate, non-identifying statistics such as which endpoints and chains are used most.</li>
          <li><strong>Legal compliance</strong> — keeping the records tax and accounting law require, and responding to lawful requests.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'legal-bases',
    title: 'Legal bases (GDPR)',
    body: (
      <>
        <p>Where the GDPR or UK GDPR applies, we rely on these bases:</p>
        <ul>
          <li><strong>Performance of a contract</strong> — account, API, Embed and billing data needed to provide what you signed up for.</li>
          <li><strong>Legitimate interests</strong> — abuse prevention, security, debugging and aggregate analytics. We balance these against your rights and keep the data minimal.</li>
          <li><strong>Legal obligation</strong> — retaining billing records.</li>
          <li><strong>Consent</strong> — for anything optional, such as marketing email if we ever offer it. You can withdraw consent at any time.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    body: (
      <>
        <ul>
          <li><strong>Account data</strong> — while your account exists, then deleted within 30 days of your deletion request.</li>
          <li><strong>Per-request usage records</strong> — up to 90 days. Monthly totals per key are kept up to 24 months so we can answer billing questions.</li>
          <li><strong>Signup IP addresses</strong> — up to 30 days. <strong>Server logs</strong> containing IP addresses — up to 30 days.</li>
          <li><strong>Billing records</strong> — as long as tax and accounting law requires (typically 7 years), held by Stripe and in our billing-event log.</li>
          <li><strong>Support email</strong> — up to 24 months after the thread closes.</li>
        </ul>
        <p>We may keep anonymised or aggregated data, which no longer identifies you, for longer.</p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share information with',
    body: (
      <>
        <p>We share personal data only with the processors that run the Service, and only as needed:</p>
        <ul>
          <li><strong>Supabase</strong> — database and authentication (account, keys, usage, partner settings).</li>
          <li><strong>Stripe</strong> — payments, invoices, the billing portal and tax calculation.</li>
          <li><strong>Vercel</strong> — hosting, edge network and request logs.</li>
          <li><strong>Email delivery provider</strong> — sending the transactional emails above.</li>
        </ul>
        <p>
          We may also disclose data when the law requires it, to protect the rights, safety or property of BananaMaps, our
          users or others, or as part of a merger, acquisition or sale of assets (we’d tell you before your data became
          subject to a different policy). <strong>We don’t sell personal data.</strong>
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and local storage',
    body: (
      <>
        <p>We use only what the Service needs to work:</p>
        <ul>
          <li><strong>Session</strong> — Supabase stores your sign-in session in your browser so you stay logged in.</li>
          <li><strong>Preferences</strong> — things like your last-used chain or view settings, stored locally in your browser.</li>
          <li><strong>Stripe</strong> — Stripe’s checkout and billing portal pages set their own cookies for fraud prevention, under Stripe’s policy.</li>
        </ul>
        <p>
          We don’t use advertising or cross-site tracking cookies, so there is no cookie banner to click through. You can clear
          site data in your browser at any time; you’ll just be signed out.
        </p>
      </>
    ),
  },
  {
    id: 'embed',
    title: 'BananaMaps Embed on partner sites',
    body: (
      <>
        <p>
          When a website shows BananaMaps Embed, your browser loads the map from our servers. We receive the request’s IP
          address, user agent, the token being viewed and the address of the page that included the map (the referrer). We
          use this to serve the map, apply the partner’s plan and fair-use limits, and prevent abuse. We don’t set tracking
          identifiers in embedded maps, and we don’t build profiles of visitors to partner sites. The partner site’s own
          privacy policy governs everything else on that page.
        </p>
      </>
    ),
  },
  {
    id: 'gdpr-rights',
    title: 'Your rights under GDPR and UK GDPR',
    body: (
      <>
        <p>If you are in the EEA, the UK or Switzerland, you have the right to:</p>
        <ul>
          <li><strong>Access</strong> the personal data we hold about you.</li>
          <li><strong>Rectify</strong> inaccurate data (email us and we will correct it).</li>
          <li><strong>Erase</strong> your data (“right to be forgotten”), subject to records we must keep by law.</li>
          <li><strong>Restrict</strong> or <strong>object</strong> to processing based on legitimate interests.</li>
          <li><strong>Port</strong> the data you gave us in a machine-readable format.</li>
          <li><strong>Withdraw consent</strong> for anything based on consent.</li>
          <li><strong>Complain</strong> to your local data protection authority.</li>
        </ul>
        <p>
          To exercise any of these, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the address on your account.
          We may ask you to confirm your identity. We respond within 30 days, and we never charge for a reasonable request.
        </p>
      </>
    ),
  },
  {
    id: 'ccpa',
    title: 'Your California privacy rights (CCPA/CPRA)',
    body: (
      <>
        <p>
          If you are a California resident, you have the right to <strong>know</strong> what personal information we collect
          and how we use and share it, to <strong>delete</strong> it, to <strong>correct</strong> it, to{' '}
          <strong>opt out of its sale or sharing</strong>, and to not be discriminated against for exercising these rights.
        </p>
        <p>
          In the last 12 months we have collected these categories: identifiers (email address, IP address, account and key
          IDs), commercial information (plan and subscription history), and internet activity (API and Embed usage). We
          collect them from you directly and from your use of the Service. <strong>We do not sell personal information and we
          do not share it for cross-context behavioural advertising</strong>, so there is nothing to opt out of.
        </p>
        <p>
          Submit a request by emailing <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. An authorised agent may submit a
          request for you with your written permission. We respond within 45 days.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <>
        <p>
          The Service is for adults. We don’t knowingly collect personal data from anyone under 18 (or under the age at
          which they can agree to our Terms where they live). If you believe a child has created an account, email us and
          we’ll delete it.
        </p>
      </>
    ),
  },
  {
    id: 'transfers',
    title: 'International transfers',
    body: (
      <>
        <p>
          Our processors run in the United States and the European Union, so your data may be processed outside the country
          you live in. Where data leaves the EEA or UK, we rely on the processor’s Standard Contractual Clauses, the EU–US Data
          Privacy Framework or another lawful mechanism.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <>
        <p>
          All traffic to the Service is encrypted in transit (TLS). API keys are stored as one-way hashes, passwords are
          hashed by Supabase Auth, database access is restricted by row-level security and service-role separation, and
          payment data never touches our servers. No system is perfectly secure, so if you find a vulnerability please tell
          us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. If a breach affects you, we’ll notify you as the law
          requires.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <>
        <p>
          We’ll post updates here with a new “Last updated” date and, for material changes, email account holders before the
          change takes effect. Earlier versions are available on request.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <>
        <p>
          BananaMaps · <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
        <p>
          For anything about your account, your data or this policy, write from the email on your account. Our{' '}
          <Link href="/terms">Terms of Service</Link> and <Link href="/refunds">Refunds &amp; Cancellation Policy</Link> cover
          the rest of the relationship.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      slug="privacy"
      title="Privacy Policy"
      summary={SUMMARY}
      lastUpdated={LEGAL_LAST_UPDATED}
      effectiveNote={`${LEGAL_LAST_UPDATED}. Applies to all accounts and to visitors of the site and of pages showing BananaMaps Embed.`}
      intro={
        <div className="legal-callout">
          <div className="legal-callout-label">Short version</div>
          <p>
            We keep what the Service needs and little else: your email, how much you use your keys, your IP address at signup
            to stop key farming, and a reference to your Stripe subscription. Stripe handles cards — we never see them. We
            don’t sell data and we don’t run ad trackers. Email us to see, fix or delete what we hold.
          </p>
        </div>
      }
      sections={SECTIONS}
    />
  );
}
