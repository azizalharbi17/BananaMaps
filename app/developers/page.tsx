import type { Metadata } from 'next';
import Link from 'next/link';
import { API_PLANS, EMBED_PLANS } from '@/lib/plans';
import CodeBlock from './components/CodeBlock';
import PricingTables from './components/PricingTables';
import { API_BASE, fmtNum } from './components/fmt';

export const metadata: Metadata = {
  title: 'Developers — BananaMaps API & BananaMaps Embed',
  description:
    'Cluster graphs, top-150 holders, wallet labels and risk scores for any token on Ethereum, BSC, Base, Solana and Robinhood Chain. Free API keys in seconds, and live holder maps for your own site with BananaMaps Embed.',
};

const SIGNUP = '/signup?next=/developers/dashboard';
const FREE = API_PLANS[0];
const PARTNER = EMBED_PLANS.find(p => p.plan === 'partner')!;

const HERO_CODE = `curl "${API_BASE}/risk/eth/0x6982508145454ce325ddbe47a25d4ec3d2311933" \\
  -H "Authorization: Bearer bm_live_YOUR_KEY"

{
  "data": {
    "token": { "symbol": "PEPE", "name": "Pepe", "chain": "eth", ... },
    "risk": {
      "score": 64,
      "label": "Medium Risk",
      "top10Pct": 25.42,
      "clusterCount": 4,
      "factors": [ ... ],
      "clusters": [ ... ]
    }
  },
  "meta": { "chain": "eth", "computedAt": "2026-10-27T09:14:03Z", "snapshotAgeSeconds": 412 }
}`;

const ENDPOINTS = [
  { path: '/v1/graph', icon: '🕸️', title: 'Cluster graph', desc: 'The full holder map: nodes, transfer edges and the connected-wallet clusters, exactly as the app draws them.' },
  { path: '/v1/holders', icon: '🐋', title: 'Top-150 holders', desc: 'Ranked holders with supply share, balance, USD value, exchange or contract label and cluster id.' },
  { path: '/v1/labels', icon: '🏷️', title: 'Wallet labels', desc: 'Is this address a CEX, DEX, burn address or contract? Curated and resolved labels for one wallet.' },
  { path: '/v1/risk', icon: '🧭', title: 'Risk score', desc: 'A 0–100 concentration and cluster score with its factors and a per-cluster summary.' },
];

export default function DevelopersPage() {
  return (
    <div className="dev-container">
      {/* Hero */}
      <section className="dev-hero">
        <div className="dev-hero-side">
          <div className="dev-eyebrow">BananaMaps for developers</div>
          <h1 className="dev-h1">Holder intelligence, in your product.</h1>
          <p className="dev-lead">
            The same cluster graphs, top-150 holders, wallet labels and risk scores you see in the BananaMaps app — as a versioned
            JSON API, and as <strong style={{ color: 'var(--text)' }}>BananaMaps Embed</strong>, a live holder map you can drop into your own site.
          </p>
          <div className="dev-actions">
            <Link href={SIGNUP} className="bm-btn bm-btn-primary dev-btn-lg">Get a free API key</Link>
            <Link href="/developers/docs" className="bm-btn bm-btn-ghost dev-btn-lg">Read the docs</Link>
          </div>
          <p className="dev-fine">
            <span>{fmtNum(FREE.monthlyQuota)} free calls a month</span> · <span>No card required</span> · <span>Keys in seconds</span>
          </p>
        </div>
        <div className="dev-hero-side">
          <CodeBlock title="GET /v1/risk" code={HERO_CODE} />
        </div>
      </section>

      {/* Two products */}
      <section className="dev-section dev-section-tight" aria-labelledby="dev-products">
        <h2 id="dev-products" className="dev-h2" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Products</h2>
        <div className="dev-grid-2">
          <Link href="/developers/docs" className="dev-card dev-card-link">
            <div className="dev-card-icon" aria-hidden>⚡</div>
            <div className="dev-card-title">BananaMaps API <span className="dev-chip">REST · JSON</span></div>
            <div className="dev-card-desc">
              Four endpoints under <code className="dev-inline-code">/v1</code>, one Bearer key, open CORS. Served from the snapshots the app already
              keeps, so answers come back in milliseconds and match what your users see on bananamaps.io.
            </div>
            <div className="dev-card-more">API documentation →</div>
          </Link>
          <Link href="/developers/embed" className="dev-card dev-card-link">
            <div className="dev-card-icon" aria-hidden>🗺️</div>
            <div className="dev-card-title">BananaMaps Embed <span className="dev-chip">Partner product</span></div>
            <div className="dev-card-desc">
              The interactive holder map, live on your token pages. Paste one snippet, pass a token and chain, and your visitors get the
              same clusters, whales and labels — refreshed automatically.
            </div>
            <div className="dev-card-more">About BananaMaps Embed →</div>
          </Link>
        </div>
      </section>

      {/* What you get */}
      <section className="dev-section" aria-labelledby="dev-what">
        <h2 id="dev-what" className="dev-h2">What you get</h2>
        <p className="dev-sub">Every endpoint reads from the cached holder-map snapshot of a token. No scraping, no RPC juggling, no waiting on a build.</p>
        <div className="dev-grid-4">
          {ENDPOINTS.map(e => (
            <div key={e.path} className="dev-card">
              <div className="dev-card-icon" aria-hidden>{e.icon}</div>
              <div className="dev-card-title">{e.title}</div>
              <div className="dev-mono" style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>{e.path}/{'{chain}'}/{'{address}'}</div>
              <div className="dev-card-desc">{e.desc}</div>
            </div>
          ))}
        </div>
        <ul className="dev-list" style={{ marginTop: 22 }}>
          <li><span><strong>Five chains.</strong> Ethereum, BSC, Base, Solana and Robinhood Chain, with the same address rules as the app.</span></li>
          <li><span><strong>Consistent shapes.</strong> Every success is <code className="dev-inline-code">{'{ data, meta }'}</code>; every error is <code className="dev-inline-code">{'{ error: { code, message, status, docs } }'}</code>.</span></li>
          <li><span><strong>Honest limits.</strong> Rate-limit and quota headers on every response, hard caps, no overage charges.</span></li>
          <li><span><strong>Browser-friendly.</strong> CORS is open and the API is GET-only, so you can call it from a server or a page.</span></li>
        </ul>
      </section>

      {/* API pricing */}
      <section className="dev-section" aria-labelledby="dev-api-pricing" id="pricing">
        <h2 id="dev-api-pricing" className="dev-h2">API pricing</h2>
        <p className="dev-sub">Monthly quotas with a hard stop — you are never billed for calls you did not plan for. Upgrade, downgrade or cancel any time from the dashboard.</p>
        <PricingTables kind="api" />
        <p className="dev-fine" style={{ marginTop: 14, textAlign: 'center' }}>Prices in USD. Yearly plans are billed up front for twelve months at the price of ten.</p>
      </section>

      {/* Embed pricing */}
      <section className="dev-section" aria-labelledby="dev-embed-pricing">
        <h2 id="dev-embed-pricing" className="dev-h2">BananaMaps Embed pricing</h2>
        <p className="dev-sub">
          Free on any site with the &ldquo;Powered by BananaMaps&rdquo; badge. The Partner plan (${PARTNER.priceMonthly}/mo) makes the badge optional,
          lets you set an accent color and refreshes the maps your visitors open first.
        </p>
        <PricingTables kind="embed" />
        <p className="dev-fine" style={{ marginTop: 14, textAlign: 'center' }}>
          <Link href="/developers/embed" style={{ color: 'var(--text2)' }}>How BananaMaps Embed works →</Link>
        </p>
      </section>

      {/* CTA band */}
      <section className="dev-band">
        <h2 className="dev-h2">Start with a free key</h2>
        <p className="dev-sub">Verify your email, copy your key, make your first call. Upgrade when you outgrow {fmtNum(FREE.monthlyQuota)} calls a month.</p>
        <div className="dev-actions">
          <Link href={SIGNUP} className="bm-btn bm-btn-primary dev-btn-lg">Create a free account</Link>
          <Link href="/developers/dashboard" className="bm-btn bm-btn-ghost dev-btn-lg">Open the dashboard</Link>
          <Link href="/developers/docs" className="bm-btn bm-btn-ghost dev-btn-lg">Docs</Link>
        </div>
      </section>
    </div>
  );
}
