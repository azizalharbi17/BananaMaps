import type { Metadata } from 'next';
import Link from 'next/link';
import { EMBED_FIRST_PARTY_HOSTS, EMBED_PLANS } from '@/lib/plans';
import CodeBlock from '../components/CodeBlock';
import HolderMapArt from '../components/HolderMapArt';
import PricingTables from '../components/PricingTables';
import { embedSnippet } from '../components/fmt';

export const metadata: Metadata = {
  title: 'BananaMaps Embed — live holder maps on your site',
  description:
    'Add the BananaMaps holder map to your own token pages. Free with the Powered by BananaMaps badge; the Partner plan adds a custom accent color, an optional badge and priority refresh.',
};

const PARTNER = EMBED_PLANS.find(p => p.plan === 'partner')!;
const PUBLIC_FIRST_PARTY = EMBED_FIRST_PARTY_HOSTS.filter(h => /[a-z]$/i.test(h) && h.includes('.'));

const WHAT = [
  { icon: '🗺️', title: 'The real map, not a screenshot', desc: 'Visitors get the interactive map from the app: bubbles sized by supply share, transfer lines, clusters, exchange labels, hover details.' },
  { icon: '🔄', title: 'Stays current on its own', desc: 'Maps are served from snapshots that refresh automatically. Partners get priority refresh for the tokens their visitors open.' },
  { icon: '⛓️', title: 'Every chain we cover', desc: 'Ethereum, BSC, Base, Solana and Robinhood Chain — pass the token address and chain, nothing else to configure.' },
];

export default function EmbedProductPage() {
  return (
    <div className="dev-container">
      <section className="dev-hero">
        <div className="dev-hero-side">
          <div className="dev-eyebrow">BananaMaps Embed</div>
          <h1 className="dev-h1">Live holder maps, on your site.</h1>
          <p className="dev-lead">
            Give your token pages the view traders actually want: who holds the supply, which wallets move together and where the
            exchanges sit. One snippet, any token, any of our five chains.
          </p>
          <div className="dev-actions">
            <Link href="/developers/dashboard" className="bm-btn bm-btn-primary dev-btn-lg">Add your site</Link>
            <a href="#quickstart" className="bm-btn bm-btn-ghost dev-btn-lg">Quickstart</a>
          </div>
          <p className="dev-fine">Free with the &ldquo;Powered by BananaMaps&rdquo; badge · Partner plan ${PARTNER.priceMonthly}/mo</p>
        </div>
        <div className="dev-hero-side">
          <HolderMapArt />
        </div>
      </section>

      <section className="dev-section dev-section-tight" aria-labelledby="embed-what">
        <h2 id="embed-what" className="dev-h2">What it is</h2>
        <p className="dev-sub">BananaMaps Embed is the holder map from bananamaps.io, productized for other sites. It renders inside a frame on your page, sized however you like.</p>
        <div className="dev-grid-3">
          {WHAT.map(w => (
            <div key={w.title} className="dev-card">
              <div className="dev-card-icon" aria-hidden>{w.icon}</div>
              <div className="dev-card-title">{w.title}</div>
              <div className="dev-card-desc">{w.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="dev-section" aria-labelledby="embed-plans" id="plans">
        <h2 id="embed-plans" className="dev-h2">Plans</h2>
        <p className="dev-sub">Both plans are managed from the developer dashboard alongside your API keys, with the same Stripe billing.</p>
        <PricingTables kind="embed" />
      </section>

      <section className="dev-section" aria-labelledby="embed-quickstart" id="quickstart">
        <h2 id="embed-quickstart" className="dev-h2">Quickstart</h2>
        <p className="dev-sub">Three steps, no build tools.</p>
        <div className="dash-two">
          <ol className="dev-steps">
            <li><span><strong>Register your site</strong> in the <Link href="/developers/dashboard">dashboard</Link> under BananaMaps Embed. You get a partner id (<code>pid</code>) that starts with <code>bme_</code>. Add the domains you will show the map on.</span></li>
            <li><span><strong>Paste the snippet</strong> where the map should appear and replace <code>TOKEN_ADDRESS</code>, the <code>chain</code> and <code>YOUR_PID</code>.</span></li>
            <li><span><strong>Optional, on Partner:</strong> add <code>&amp;badge=0</code> to hide the badge, or <code>&amp;accent=RRGGBB</code> to recolor the map to your brand.</span></li>
          </ol>
          <CodeBlock title="HTML" code={embedSnippet()} />
        </div>
        <p className="dev-fine" style={{ marginTop: 16 }}>
          Full parameter reference in the <Link href="/developers/docs#embed" style={{ color: 'var(--text2)' }}>docs</Link>.
        </p>
      </section>

      <section className="dev-section" aria-labelledby="embed-faq">
        <h2 id="embed-faq" className="dev-h2">Questions</h2>
        <div className="dev-faq" style={{ marginTop: 18 }}>
          <details>
            <summary>Do I need a partner id?</summary>
            <div className="dev-faq-body">
              <p>
                On our own properties ({PUBLIC_FIRST_PARTY.join(', ')}) the map works without one. On any other domain the snippet must carry a
                valid <code>pid</code>; without it, visitors see a short &ldquo;get a free Embed key&rdquo; message in place of the map instead of a broken frame.
              </p>
              <p>Partner ids are free. Create one in the dashboard in a few seconds.</p>
            </div>
          </details>
          <details>
            <summary>Is the badge really required on the Free plan?</summary>
            <div className="dev-faq-body">
              <p>
                Yes. The Free plan shows a small &ldquo;Powered by BananaMaps&rdquo; badge with a link in the corner of the map. Hiding it, or covering it with
                your own layout, is what the Partner plan is for — and it is grounds for the id to be revoked on Free.
              </p>
            </div>
          </details>
          <details>
            <summary>What does the Partner plan change?</summary>
            <div className="dev-faq-body">
              <p>
                Three things: the badge becomes optional (<code>badge=0</code>), you can set a custom accent color that replaces the gold in the map
                (<code>accent=RRGGBB</code>, or saved on the site in your dashboard), and the tokens your visitors open are refreshed with priority. You also get email support.
              </p>
              <p>${PARTNER.priceMonthly} a month or ${PARTNER.priceYearly} a year, cancel any time from the dashboard.</p>
            </div>
          </details>
          <details>
            <summary>How fresh is the data?</summary>
            <div className="dev-faq-body">
              <p>
                The map is drawn from a snapshot of the token&apos;s top 150 holders and the transfers between them. Snapshots refresh automatically in
                the background, with the most-viewed tokens first; Partner sites get priority for the tokens their visitors open. A token nobody has
                mapped yet shows a short build state the first time it is opened, then loads instantly afterwards.
              </p>
            </div>
          </details>
          <details>
            <summary>Can I restrict my id to my domains?</summary>
            <div className="dev-faq-body">
              <p>
                Yes, and you should. Add your hostnames when you register the site (wildcards like <code>*.example.com</code> work). The map only renders
                when the page showing it matches one of them, so nobody can reuse your id on their own site.
              </p>
            </div>
          </details>
          <details>
            <summary>Does the map count against my API quota?</summary>
            <div className="dev-faq-body">
              <p>No. BananaMaps Embed and the BananaMaps API are metered separately. Showing a map on your site never consumes API calls from your plan.</p>
            </div>
          </details>
        </div>
      </section>

      <section className="dev-band">
        <h2 className="dev-h2">Put the map on your site today</h2>
        <p className="dev-sub">Create a free account, register your domain and paste the snippet. Upgrade to Partner when you want it in your colors.</p>
        <div className="dev-actions">
          <Link href="/developers/dashboard" className="bm-btn bm-btn-primary dev-btn-lg">Open the dashboard</Link>
          <Link href="/developers/docs#embed" className="bm-btn bm-btn-ghost dev-btn-lg">Embed docs</Link>
        </div>
      </section>
    </div>
  );
}
