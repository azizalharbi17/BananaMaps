// DRAFT — generated, not reviewed by a lawyer; review before launch.
//
// Terms of Service for bananamaps.io, the BananaMaps API and BananaMaps Embed.
// Governing law is left as a "[Jurisdiction]" placeholder on purpose.
import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { LEGAL_LAST_UPDATED, SUPPORT_EMAIL, type LegalSection } from '../legal/LegalPage';

const SUMMARY =
  'The agreement between you and BananaMaps for using the site, the BananaMaps API and BananaMaps Embed — in plain English.';

export const metadata: Metadata = {
  title: 'Terms of Service — BananaMaps',
  description: SUMMARY,
};

const SECTIONS: LegalSection[] = [
  {
    id: 'service',
    title: 'The Service',
    body: (
      <>
        <p>BananaMaps (“BananaMaps”, “we”, “us”) provides:</p>
        <ul>
          <li>
            <strong>Holder maps</strong> — interactive maps of a token’s largest holders, the transfers between them, and the
            clusters, exchanges and known wallets we detect, at bananamaps.io and in the BananaMaps app.
          </li>
          <li>
            <strong>BananaMaps API</strong> — programmatic access to the same cached holder, label, cluster and risk data
            through versioned HTTP endpoints.
          </li>
          <li>
            <strong>BananaMaps Embed</strong> — a way to show live holder maps on a website you control, with a partner key
            and optional customisation on paid plans.
          </li>
        </ul>
        <p>
          Together these are the “Service”. These Terms of Service (“Terms”) apply to anyone who visits the site, creates an
          account, requests an API key or shows BananaMaps Embed on a page they control. Our{' '}
          <Link href="/privacy">Privacy Policy</Link> and <Link href="/refunds">Refunds &amp; Cancellation Policy</Link> are part of
          these Terms.
        </p>
        <p>
          If you use the Service for a company or other organisation, you confirm that you are allowed to accept these Terms on
          its behalf, and “you” includes that organisation.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Eligibility, accounts and API keys',
    body: (
      <>
        <p>
          You must be at least 18 years old (or the age of majority where you live) to create an account. You must give us a
          working email address and keep it current, because that is how we confirm your account, deliver receipts and reach
          you about quota, billing or security.
        </p>
        <ul>
          <li>
            <strong>One person, one account.</strong> Accounts are personal. Don’t share a login, and don’t create several Free
            accounts to get more free calls than one Free plan allows.
          </li>
          <li>
            <strong>Keep your keys secret.</strong> API keys and partner keys identify you. Store them server-side, don’t ship
            API keys in public client code, and don’t publish them. Anything done with your keys counts as done by you.
          </li>
          <li>
            <strong>Tell us about leaks.</strong> If a key is exposed, revoke it in the developer dashboard and create a new
            one. Email us if you think your account itself was compromised.
          </li>
        </ul>
        <p>
          We may revoke keys, suspend or close accounts, and refuse new accounts for abuse. “Abuse” includes circumventing
          rate limits or quotas, scraping the site or API outside your plan, reselling or redistributing our data as a
          product of its own, using disposable email addresses to farm free keys, attacking the Service, or anything in
          Section 3. Where practical we’ll warn you first; for serious or ongoing abuse we may act immediately.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You agree not to, and not to help anyone else to:</p>
        <ul>
          <li>Access the Service by any automated means other than the documented BananaMaps API within your plan’s limits.</li>
          <li>Bypass, probe or defeat rate limits, quotas, authentication, partner-key checks or other security measures.</li>
          <li>Resell, sublicense, rent or redistribute data from the Service as a dataset, feed or competing API.</li>
          <li>Remove or hide required attribution, including the “Powered by BananaMaps” badge on free BananaMaps Embed plans.</li>
          <li>Use the Service to harass, dox, defame or target any person, or in any way that breaks the law where you are.</li>
          <li>Present BananaMaps data as your own original analysis in a way that misleads your users about its source or reliability.</li>
          <li>Interfere with the Service, its infrastructure or other customers (for example by sending excessive or malformed traffic).</li>
          <li>Reverse engineer the Service except where the law gives you that right regardless of this clause.</li>
          <li>Pretend to be BananaMaps, or imply we endorse your product, without our written permission.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'billing',
    title: 'Plans, billing and taxes',
    body: (
      <>
        <p>
          The Free plans for the BananaMaps API and BananaMaps Embed need no payment card. Paid plans (API Starter, API Pro and
          Embed Partner) are subscriptions billed in advance, monthly or yearly, and processed by Stripe. We don’t store your
          card details — see the <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <ul>
          <li>
            <strong>Auto-renewal.</strong> Subscriptions renew automatically at the end of each billing period until you cancel.
            You can cancel at any time from the billing portal in your developer dashboard; access continues until the end of
            the period you’ve paid for.
          </li>
          <li>
            <strong>Price changes.</strong> We may change prices. We’ll email you at least 30 days before a change affects you,
            and it will apply from your next renewal after that notice. If you don’t agree, cancel before the renewal.
          </li>
          <li>
            <strong>Taxes.</strong> Prices exclude VAT, GST, sales tax and similar taxes unless we say otherwise. Where we are
            required to collect tax, Stripe adds it at checkout; otherwise you are responsible for any tax that applies to you.
          </li>
          <li>
            <strong>Failed payments.</strong> If a renewal payment fails, Stripe retries it. If it keeps failing, we may downgrade
            your account to the Free plan until payment succeeds.
          </li>
          <li>
            <strong>Refunds</strong> are covered by our <Link href="/refunds">Refunds &amp; Cancellation Policy</Link>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'limits',
    title: 'Quotas, rate limits and fair use',
    body: (
      <>
        <p>
          Every API plan has a monthly call quota and a per-minute rate limit, shown on the{' '}
          <Link href="/developers">developer portal</Link>. Each successful or failed authorised call counts toward your quota.
          When you reach it, the API returns <code>429 quota_exceeded</code> until your period resets or you upgrade — there is
          no overage billing. Per-minute limits return <code>429 rate_limited</code> with a <code>Retry-After</code> header.
        </p>
        <p>
          Upgrades and plan switches made from the dashboard take effect immediately, with the price difference prorated by
          Stripe. Cancellations take effect at the end of the current paid period, at which point your quota changes to the
          Free plan’s. We may adjust limits to protect the Service; if a change reduces
          what your paid plan includes, we’ll give you notice.
        </p>
        <p>
          Snapshots behind the API and Embed are refreshed on our schedule, not on demand, and some tokens may not have a
          snapshot yet. Requests for those return <code>404 not_indexed</code> with a link to the app page that builds one.
        </p>
      </>
    ),
  },
  {
    id: 'api',
    title: 'BananaMaps API terms',
    body: (
      <>
        <ul>
          <li>
            <strong>Licence.</strong> While your account is in good standing, you may call the API within your plan and use the
            responses inside your own product, research or internal tooling.
          </li>
          <li>
            <strong>Caching.</strong> You may cache responses to serve your own users. You may not build a stored copy of our
            data to offer as a dataset, feed or API of your own, or to train a product that replaces the Service.
          </li>
          <li>
            <strong>Attribution.</strong> If you show API data to the public, a visible “Data by BananaMaps” credit with a link is
            appreciated but not required on paid plans. It is required on the Free plan.
          </li>
          <li>
            <strong>Versioning.</strong> Endpoints live under <code>/v1/</code>. We add fields without notice and only remove or
            change the meaning of existing fields in a new version, with at least 90 days’ notice before retiring an old one
            unless security requires otherwise.
          </li>
          <li>
            <strong>Keys in browsers.</strong> API keys are for servers. Keys found in public web pages or mobile apps may be
            revoked, since anyone could use them against your quota.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'embed',
    title: 'BananaMaps Embed terms',
    body: (
      <>
        <ul>
          <li>
            <strong>Partner key and domains.</strong> BananaMaps Embed works on the domains you register for a partner key.
            Register only domains you control. We may disable a key used from other domains.
          </li>
          <li>
            <strong>Attribution badge.</strong> On the Free plan the “Powered by BananaMaps” badge and its link must stay
            visible, unmodified and not covered, cropped, faded or hidden with styling or scripts. Removing or hiding the badge
            is allowed only on the Partner plan, and only through the setting in your dashboard.
          </li>
          <li>
            <strong>Customisation.</strong> Custom accent colours and other Partner features are available while the Partner
            subscription is active. When it ends, the Free defaults (including the badge) return automatically.
          </li>
          <li>
            <strong>Context.</strong> Don’t show BananaMaps Embed next to content that misrepresents what the map shows, that
            promotes a token as “verified” or “safe” because of it, or that is unlawful. We may disable embeds in those
            contexts.
          </li>
          <li>
            <strong>Rate limits.</strong> Embed traffic is subject to fair-use limits. Very high-traffic pages should talk to us
            about the Partner plan or a custom arrangement.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'as-is',
    title: 'Service provided “as is” — no SLA',
    body: (
      <>
        <p>
          The Service is provided <strong>“as is” and “as available”</strong>. We don’t offer a service level agreement, uptime
          guarantee, support response guarantee or data-freshness guarantee on any plan. We may change, pause or discontinue
          any part of the Service at any time, and we may do maintenance without notice.
        </p>
        <p>
          To the fullest extent the law allows, we disclaim all warranties, express or implied, including warranties of
          merchantability, fitness for a particular purpose, accuracy, non-infringement and uninterrupted or error-free
          operation. Some jurisdictions don’t allow some of these exclusions, so some may not apply to you.
        </p>
      </>
    ),
  },
  {
    id: 'not-advice',
    title: 'Informational data, not financial advice',
    body: (
      <>
        <div className="legal-callout">
          <div className="legal-callout-label">Important</div>
          <p>
            Nothing on BananaMaps is investment, financial, legal or tax advice, and nothing is a recommendation to buy, sell or
            hold any token. Don’t rely on it to make decisions. You alone are responsible for what you do with your money.
          </p>
        </div>
        <p>Blockchain data is messy, and our processing of it is automated. In particular:</p>
        <ul>
          <li>Holder lists, balances, prices and transfer histories may be incomplete, delayed, duplicated or simply wrong.</li>
          <li>Labels such as “exchange”, “burn” or “contract” are best-effort heuristics and curated lists, not verified identities.</li>
          <li>Clusters show wallets that transferred tokens between each other. That does not prove common ownership.</li>
          <li>Risk scores are heuristic summaries of concentration and clustering. They are not ratings, audits or predictions.</li>
          <li>Some snapshots are hours or days old, and prices come from third-party sources we don’t control.</li>
        </ul>
        <p>
          BananaMaps is not a broker, dealer, exchange, investment adviser or auditor, and we don’t have any relationship with
          the tokens or projects shown.
        </p>
      </>
    ),
  },
  {
    id: 'ip',
    title: 'Intellectual property',
    body: (
      <>
        <p>
          The Service — its software, design, text, logos, the BananaMaps name and the way we compile, label, cluster, score and
          visualise data — belongs to BananaMaps or our licensors and is protected by copyright, database, trademark and
          other laws. Raw blockchain data itself is public; our compilation and derived data are not.
        </p>
        <p>
          We give you a limited, non-exclusive, non-transferable, revocable licence to use the Service as your plan allows and
          these Terms permit. Nothing transfers ownership to you. If you send us feedback or suggestions, we may use them
          without any obligation to you.
        </p>
      </>
    ),
  },
  {
    id: 'third-parties',
    title: 'Third-party services',
    body: (
      <>
        <p>
          We rely on third parties such as Stripe (payments), Supabase (database and authentication), Vercel (hosting) and
          blockchain data providers. Their services are governed by their own terms, and we aren’t responsible for their
          availability, accuracy or conduct. Links from the Service to other sites are provided for convenience only.
        </p>
      </>
    ),
  },
  {
    id: 'termination',
    title: 'Termination',
    body: (
      <>
        <p>
          You can stop using the Service at any time. Cancel paid plans from the billing portal, and email us if you want
          your account deleted. We may suspend or terminate your access, revoke keys or disable embeds if you break these
          Terms, if we must for legal or security reasons, if you don’t pay, or if we discontinue the Service (in which case
          we’ll give reasonable notice and refund any prepaid, unused period).
        </p>
        <p>
          When your access ends, your keys stop working and your licence under Section 10 ends. Sections that by their nature
          should survive — including 8, 9, 10, 13, 14 and 15 — continue to apply.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <>
        <p>
          To the fullest extent the law allows, BananaMaps and the people who build it will not be liable for any indirect,
          incidental, special, consequential or punitive damages, or for lost profits, lost revenue, lost data, trading losses,
          or the cost of substitute services, arising out of or related to the Service or these Terms — however caused and
          under any theory of liability, even if we were told such damages were possible.
        </p>
        <p>
          Our total liability for all claims related to the Service in any 12-month period is limited to the greater of (a) the
          amount you paid us in the 12 months before the claim arose and (b) USD 100. Some jurisdictions don’t allow some of
          these limits; where that applies, our liability is limited to the smallest amount the law permits.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    body: (
      <>
        <p>
          You agree to defend and compensate BananaMaps for claims, losses and reasonable legal costs arising from your use of
          the Service, your product, your breach of these Terms, or your violation of any law or third-party right. We’ll let
          you know about any such claim promptly and cooperate reasonably.
        </p>
      </>
    ),
  },
  {
    id: 'law',
    title: 'Governing law and disputes',
    body: (
      <>
        <p>
          These Terms are governed by the laws of <strong>[Jurisdiction]</strong>, without regard to its conflict-of-laws rules.
          Any dispute that we can’t resolve informally will be heard in the courts of <strong>[Jurisdiction]</strong>, and you
          consent to their jurisdiction. If you are a consumer in a country whose law gives you additional mandatory
          protections, you keep those protections.
        </p>
        <p>
          Before taking formal action, please email us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Most problems
          are faster to fix than to litigate.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these Terms',
    body: (
      <>
        <p>
          We may update these Terms as the Service evolves. We’ll post the new version here with a new “Last updated” date.
          For material changes we’ll email account holders at least 14 days before the change takes effect. Using the Service
          after that date means you accept the new Terms; if you don’t, stop using the Service and cancel any paid plan.
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
        <p>Please write from the email address on your account so we can verify it’s you.</p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      slug="terms"
      title="Terms of Service"
      summary={SUMMARY}
      lastUpdated={LEGAL_LAST_UPDATED}
      effectiveNote={`${LEGAL_LAST_UPDATED} for all accounts. Material changes are announced by email at least 14 days before they apply.`}
      intro={
        <>
          <p>
            These Terms are a contract between you and BananaMaps. By creating an account, requesting an API key, showing
            BananaMaps Embed on a site you control, or otherwise using the Service, you agree to them. If you don’t agree,
            please don’t use the Service.
          </p>
          <div className="legal-callout">
            <div className="legal-callout-label">Short version</div>
            <p>
              BananaMaps shows on-chain holder data for information only. It is not financial advice, it can be incomplete or
              wrong, and we don’t promise uptime. Keep your keys secret, stay within your plan’s limits, don’t resell the
              data, and keep the badge on free Embeds. Paid plans renew automatically until you cancel.
            </p>
          </div>
        </>
      }
      sections={SECTIONS}
    />
  );
}
