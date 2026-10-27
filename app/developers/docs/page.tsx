import type { Metadata } from 'next';
import Link from 'next/link';
import { API_PLANS, EMBED_FIRST_PARTY_HOSTS } from '@/lib/plans';
import CodeBlock from '../components/CodeBlock';
import DocsNav, { type DocsNavItem } from '../components/DocsNav';
import { API_BASE, curlExample, embedSnippet, fmtNum } from '../components/fmt';
import {
  SAMPLE_ERROR_RESPONSE, SAMPLE_GRAPH_RESPONSE, SAMPLE_HOLDERS_RESPONSE, SAMPLE_LABEL_RESPONSE, SAMPLE_NOT_INDEXED,
  SAMPLE_PATHS, SAMPLE_RISK_RESPONSE, json,
} from './samples';

export const metadata: Metadata = {
  title: 'API docs — BananaMaps API v1 & BananaMaps Embed',
  description:
    'Reference for the BananaMaps API: authentication, the graph, holders, labels and risk endpoints, error codes, rate limits and quotas, snapshot semantics, and the BananaMaps Embed quickstart.',
};

const NAV: DocsNavItem[] = [
  { id: 'overview', label: 'Overview', group: 'Getting started' },
  { id: 'auth', label: 'Authentication', group: 'Getting started' },
  { id: 'quickstart', label: 'Quickstart', group: 'Getting started' },
  { id: 'graph', label: 'Graph', group: 'Endpoints' },
  { id: 'holders', label: 'Holders', group: 'Endpoints' },
  { id: 'labels', label: 'Labels', group: 'Endpoints' },
  { id: 'risk', label: 'Risk', group: 'Endpoints' },
  { id: 'errors', label: 'Errors', group: 'Reference' },
  { id: 'limits', label: 'Rate limits & quotas', group: 'Reference' },
  { id: 'snapshots', label: 'Snapshots', group: 'Reference' },
  { id: 'embed', label: 'Embed quickstart', group: 'BananaMaps Embed' },
  { id: 'embed-params', label: 'Embed parameters', group: 'BananaMaps Embed' },
];

const PUBLIC_FIRST_PARTY = EMBED_FIRST_PARTY_HOSTS.filter(h => /[a-z]$/i.test(h) && h.includes('.')); // real domains only, not dev hosts

const JS_EXAMPLE = `const res = await fetch(
  "${API_BASE}/holders/eth/${SAMPLE_PATHS.token}",
  { headers: { Authorization: "Bearer " + process.env.BANANAMAPS_KEY } }
);
if (!res.ok) {
  const { error } = await res.json();
  throw new Error(error.code + ": " + error.message);
}
const { data, meta } = await res.json();
console.log(data.token.symbol, data.holders.length, "holders; snapshot", meta.computedAt);`;

const ERRORS: { code: string; status: number; meaning: string }[] = [
  { code: 'bad_request', status: 400, meaning: 'Unknown chain, or the address is not a valid address for that chain. Not metered.' },
  { code: 'unauthorized', status: 401, meaning: 'No Authorization header, or it is not "Bearer <key>".' },
  { code: 'invalid_key', status: 401, meaning: 'The key is malformed or does not exist.' },
  { code: 'revoked_key', status: 401, meaning: 'The key was revoked in the dashboard. Create a new one.' },
  { code: 'account_canceled', status: 403, meaning: 'The account is closed.' },
  { code: 'not_found', status: 404, meaning: 'Unknown route.' },
  { code: 'not_indexed', status: 404, meaning: 'No snapshot exists for this token yet. The message carries the app link that builds one.' },
  { code: 'quota_exceeded', status: 429, meaning: 'The monthly quota of your plan is used up. Retry-After points at the reset; upgrade for more.' },
  { code: 'rate_limited', status: 429, meaning: 'Too many calls this minute. Retry-After says how many seconds to wait.' },
  { code: 'server_error', status: 500, meaning: 'Something failed on our side. Safe to retry.' },
];

const HEADERS: { name: string; meaning: string }[] = [
  { name: 'X-RateLimit-Limit', meaning: 'Calls allowed per minute on your plan.' },
  { name: 'X-RateLimit-Remaining', meaning: 'Calls left in the current minute.' },
  { name: 'X-RateLimit-Reset', meaning: 'Unix time (seconds) when the minute window resets.' },
  { name: 'X-Quota-Limit', meaning: 'Calls allowed this month on your plan.' },
  { name: 'X-Quota-Used', meaning: 'Calls counted this month, including this one.' },
  { name: 'X-Quota-Reset', meaning: 'ISO timestamp of the start of the next monthly period.' },
  { name: 'Retry-After', meaning: 'Only on 429: seconds until you may call again.' },
];

const EMBED_PARAMS: { name: string; req: string; meaning: string }[] = [
  { name: 'token', req: 'required', meaning: 'Token contract address (EVM 0x…, or a Solana mint).' },
  { name: 'chain', req: 'required', meaning: 'One of eth, bsc, base, sol, robinhood.' },
  { name: 'pid', req: 'required*', meaning: 'Your partner id from the dashboard (bme_…). *Not needed on first-party domains.' },
  { name: 'badge', req: 'Partner plan', meaning: 'badge=0 hides the "Powered by BananaMaps" badge. Ignored on the Free plan.' },
  { name: 'accent', req: 'Partner plan', meaning: 'Six-digit hex without #, e.g. accent=00C805. Replaces the gold accent in the map. Ignored on the Free plan.' },
];

function PathParams() {
  return (
    <div className="dev-table-wrap">
      <table className="dev-table">
        <thead><tr><th>Parameter</th><th>In</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>chain</code></td><td>path</td><td>One of <code>eth</code>, <code>bsc</code>, <code>base</code>, <code>sol</code>, <code>robinhood</code>.</td></tr>
          <tr><td><code>address</code></td><td>path</td><td>Token contract address. EVM: <code>0x</code> + 40 hex characters (case does not matter; responses lowercase it). Solana: base58 mint, 32–44 characters, case-sensitive.</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Endpoint({ path }: { path: string }) {
  const [, , chain, addr] = path.split('/');
  return (
    <div className="dev-endpoint">
      <span className="dev-method">GET</span>
      <span className="dev-path">/v1/{path.split('/')[1]}/<em>{chain}</em>/<em>{addr}</em></span>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="dev-container">
      <div className="dev-docs">
        <DocsNav items={NAV} />

        <div className="dev-docs-body">
          {/* Overview */}
          <section id="overview" className="dev-doc-section">
            <div className="dev-eyebrow">BananaMaps API · v1</div>
            <h1 className="dev-h1" style={{ fontSize: 'clamp(28px, 4vw, 44px)' }}>API documentation</h1>
            <p className="dev-p">
              The BananaMaps API returns the holder intelligence behind the app — cluster graphs, ranked holders, wallet labels and risk
              scores — as JSON. Everything is served from the cached snapshot of a token, so responses are fast and identical to what the
              app shows at that moment.
            </p>
            <div className="dev-stack" style={{ marginTop: 18 }}>
              <div className="dev-table-wrap">
                <table className="dev-table">
                  <tbody>
                    <tr><td>Base URL</td><td><code>{API_BASE}</code></td></tr>
                    <tr><td>Format</td><td>JSON. Success: <code>{'{ data, meta }'}</code>. Error: <code>{'{ error: { code, message, status, docs } }'}</code>.</td></tr>
                    <tr><td>Methods</td><td><code>GET</code> only (plus <code>OPTIONS</code> for CORS preflight).</td></tr>
                    <tr><td>CORS</td><td>Open (<code>Access-Control-Allow-Origin: *</code>); rate-limit and quota headers are exposed to browsers.</td></tr>
                    <tr><td>Versioning</td><td>The version is in the path. Fields may be added to <code>v1</code> responses; none will be removed or renamed without a <code>v2</code>.</td></tr>
                    <tr><td>Chains</td><td><code>eth</code> Ethereum · <code>bsc</code> BNB Smart Chain · <code>base</code> Base · <code>sol</code> Solana · <code>robinhood</code> Robinhood Chain</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Auth */}
          <section id="auth" className="dev-doc-section">
            <h2 className="dev-h2">Authentication</h2>
            <p className="dev-p">
              Every call carries your API key as a Bearer token. Keys start with <code>bm_live_</code> and are created in the{' '}
              <Link href="/developers/dashboard">dashboard</Link>; a verified free account gets its first key immediately.
            </p>
            <div className="dev-stack" style={{ marginTop: 14 }}>
              <CodeBlock title="Header" code={'Authorization: Bearer bm_live_YOUR_KEY'} />
              <div className="dev-note">
                <strong>Keep keys on the server where you can.</strong> We store only a hash of each key and never write keys to logs. If a key leaks,
                revoke it in the dashboard — requests with it fail immediately with <code>revoked_key</code> — and create a new one. You can hold up to five active keys.
              </div>
            </div>
          </section>

          {/* Quickstart */}
          <section id="quickstart" className="dev-doc-section">
            <h2 className="dev-h2">Quickstart</h2>
            <p className="dev-p">Fetch the top holders of PEPE on Ethereum. The same shape works for any token that has a snapshot.</p>
            <div className="dev-stack" style={{ marginTop: 14 }}>
              <CodeBlock title="curl" code={curlExample(`/holders/eth/${SAMPLE_PATHS.token}`)} />
              <CodeBlock title="JavaScript" code={JS_EXAMPLE} />
            </div>
            <p className="dev-p" style={{ marginTop: 14 }}>
              Validation happens before metering: a <code>400</code> for a bad chain or address does not count against your quota. Every
              authorized response, including errors, carries the <a href="#limits">rate-limit and quota headers</a>.
            </p>
          </section>

          {/* Graph */}
          <section id="graph" className="dev-doc-section">
            <h2 className="dev-h2">Graph</h2>
            <p className="dev-p">
              The full cluster graph of a token: the mapped holders and the counterparties that connect them (<code>nodes</code>), the transfers
              observed between them (<code>edges</code>, indexes into <code>nodes</code>) and the connected-wallet <code>clusters</code>. This is the
              payload the app renders.
            </p>
            <Endpoint path="/graph/{chain}/{address}" />
            <PathParams />
            <h3 className="dev-h3">Response fields</h3>
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><code>data.token</code></td><td>object</td><td>Token summary — see <a href="#token-object">token object</a>.</td></tr>
                  <tr><td><code>data.nodes[]</code></td><td>array</td><td><code>address</code>, <code>kind</code> (<code>holder</code> | <code>counterparty</code>), <code>rank</code> (1-based among holders, <code>null</code> for counterparties), <code>pct</code> of supply, <code>balance</code>, <code>usdValue</code>, <code>label</code>, <code>labelType</code>, <code>cluster</code> id or <code>null</code>, <code>degree</code> (edges touching the node).</td></tr>
                  <tr><td><code>data.edges[]</code></td><td>array</td><td><code>from</code> and <code>to</code> are indexes into <code>nodes</code>; <code>count</code> is the number of transfers in that direction.</td></tr>
                  <tr><td><code>data.clusters[]</code></td><td>array</td><td><code>id</code>, <code>members</code> (node indexes), combined <code>pct</code> of supply.</td></tr>
                  <tr><td><code>meta</code></td><td>object</td><td><code>chain</code>, <code>address</code>, <code>computedAt</code>, <code>snapshotAgeSeconds</code>.</td></tr>
                </tbody>
              </table>
            </div>
            <h3 className="dev-h3">Example</h3>
            <div className="dev-stack">
              <CodeBlock title="curl" code={curlExample(`/graph/eth/${SAMPLE_PATHS.token}`)} />
              <CodeBlock title="200 OK (abridged to three holders)" code={json(SAMPLE_GRAPH_RESPONSE)} />
            </div>
          </section>

          {/* Holders */}
          <section id="holders" className="dev-doc-section">
            <h2 className="dev-h2">Holders</h2>
            <p className="dev-p">The top 150 holders of a token, ranked by balance, with their share of supply, USD value, label and cluster.</p>
            <Endpoint path="/holders/{chain}/{address}" />
            <PathParams />
            <h3 className="dev-h3">Response fields</h3>
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><code>data.token</code></td><td>object</td><td>Token summary — see <a href="#token-object">token object</a>.</td></tr>
                  <tr><td><code>data.holders[]</code></td><td>array</td><td>Up to 150 entries: <code>rank</code>, <code>address</code>, <code>pct</code> (percent of total supply), <code>balance</code> (token units), <code>usdValue</code>, <code>label</code>, <code>labelType</code> (<code>cex</code> | <code>dex</code> | <code>burn</code> | <code>contract</code> | <code>null</code>), <code>cluster</code> id or <code>null</code>.</td></tr>
                  <tr><td><code>meta</code></td><td>object</td><td><code>chain</code>, <code>address</code>, <code>computedAt</code>, <code>snapshotAgeSeconds</code>.</td></tr>
                </tbody>
              </table>
            </div>
            <h3 className="dev-h3">Example</h3>
            <div className="dev-stack">
              <CodeBlock title="curl" code={curlExample(`/holders/eth/${SAMPLE_PATHS.token}`)} />
              <CodeBlock title="200 OK (abridged to three holders)" code={json(SAMPLE_HOLDERS_RESPONSE)} />
            </div>
            <h3 className="dev-h3" id="token-object">The token object</h3>
            <p className="dev-p">Graph, holders and risk responses share <code>data.token</code>:</p>
            <div className="dev-table-wrap" style={{ marginTop: 10 }}>
              <table className="dev-table">
                <thead><tr><th>Field</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><code>chain</code>, <code>address</code></td><td>As requested; EVM addresses lowercased.</td></tr>
                  <tr><td><code>name</code>, <code>symbol</code>, <code>logo</code></td><td>Token metadata; <code>logo</code> may be <code>null</code>.</td></tr>
                  <tr><td><code>price</code>, <code>priceChange24h</code></td><td>USD price and 24 h change in percent at snapshot time; <code>null</code> when unknown.</td></tr>
                  <tr><td><code>marketCap</code>, <code>volume24h</code></td><td>USD; <code>null</code> when unknown.</td></tr>
                  <tr><td><code>totalHolders</code></td><td>On-chain holder count where the chain exposes it (EVM); <code>null</code> otherwise.</td></tr>
                  <tr><td><code>holdersMapped</code></td><td>How many holders are in the snapshot (up to 150).</td></tr>
                  <tr><td><code>computedAt</code></td><td>ISO timestamp of the snapshot.</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Labels */}
          <section id="labels" className="dev-doc-section">
            <h2 className="dev-h2">Labels</h2>
            <p className="dev-p">
              The label for one wallet address: centralized exchange, DEX or AMM contract, burn address or other contract. Labels come from our
              curated list first, then from labels resolved while building maps, then from address patterns (burn addresses).
            </p>
            <div className="dev-endpoint">
              <span className="dev-method">GET</span>
              <span className="dev-path">/v1/labels/<em>{'{chain}'}</em>/<em>{'{wallet}'}</em></span>
            </div>
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead><tr><th>Parameter</th><th>In</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><code>chain</code></td><td>path</td><td>One of <code>eth</code>, <code>bsc</code>, <code>base</code>, <code>sol</code>, <code>robinhood</code>.</td></tr>
                  <tr><td><code>wallet</code></td><td>path</td><td>The wallet address to label (same address rules as tokens). Does not need a snapshot.</td></tr>
                </tbody>
              </table>
            </div>
            <h3 className="dev-h3">Response fields</h3>
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><code>data.address</code></td><td>string</td><td>The wallet, normalized.</td></tr>
                  <tr><td><code>data.label</code></td><td>string | null</td><td>Human label such as <code>Binance 8</code> or <code>Burn Address</code>.</td></tr>
                  <tr><td><code>data.labelType</code></td><td>enum | null</td><td><code>cex</code>, <code>dex</code>, <code>burn</code>, <code>contract</code>, or <code>null</code> when unlabeled.</td></tr>
                  <tr><td><code>data.source</code></td><td>enum | null</td><td><code>curated</code> (our list), <code>resolved</code> (learned while mapping), <code>pattern</code> (address shape), or <code>null</code>.</td></tr>
                  <tr><td><code>meta</code></td><td>object</td><td><code>chain</code>, <code>address</code>.</td></tr>
                </tbody>
              </table>
            </div>
            <h3 className="dev-h3">Example</h3>
            <div className="dev-stack">
              <CodeBlock title="curl" code={curlExample(`/labels/eth/${SAMPLE_PATHS.wallet}`)} />
              <CodeBlock title="200 OK" code={json(SAMPLE_LABEL_RESPONSE)} />
            </div>
          </section>

          {/* Risk */}
          <section id="risk" className="dev-doc-section">
            <h2 className="dev-h2">Risk</h2>
            <p className="dev-p">
              A 0–100 score of how concentrated and clustered a token&apos;s supply is, with the factors behind it and a summary of each cluster.
              Higher is healthier. Exchange, DEX and burn wallets are excluded from the concentration factors; labeled contracts (vesting, treasuries) count as holders, as in the app. <code>clusterCount</code> counts every cluster; <code>meaningfulClusterCount</code> is the number the Cluster Activity factor scores (clusters with at least two top holders).
            </p>
            <Endpoint path="/risk/{chain}/{address}" />
            <PathParams />
            <h3 className="dev-h3">Response fields</h3>
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><code>data.token</code></td><td>object</td><td>Token summary — see <a href="#token-object">token object</a>.</td></tr>
                  <tr><td><code>data.risk.score</code></td><td>number</td><td>0–100. ≥ 80 Low Risk · 50–79 Medium · 25–49 High · &lt; 25 Very High.</td></tr>
                  <tr><td><code>data.risk.label</code></td><td>string</td><td>The band name for <code>score</code>.</td></tr>
                  <tr><td><code>data.risk.factors[]</code></td><td>array</td><td><code>name</code>, <code>score</code> (0–100), <code>weight</code> (percent of the total), <code>detail</code> (human explanation). Weights sum to 100.</td></tr>
                  <tr><td><code>data.risk.top10Pct</code></td><td>number</td><td>Share of supply held by the ten largest mapped holders, exchanges included.</td></tr>
                  <tr><td><code>data.risk.clusterCount</code></td><td>number</td><td>Number of clusters in the snapshot.</td></tr>
                  <tr><td><code>data.risk.clusters[]</code></td><td>array</td><td><code>id</code>, <code>wallets</code> (all members), <code>holders</code> (members in the top 150), combined <code>pct</code>, <code>members</code> (addresses).</td></tr>
                  <tr><td><code>meta</code></td><td>object</td><td><code>chain</code>, <code>address</code>, <code>computedAt</code>, <code>snapshotAgeSeconds</code>.</td></tr>
                </tbody>
              </table>
            </div>
            <div className="dev-note" style={{ marginTop: 14 }}>
              The score describes supply structure at snapshot time. It is <strong>informational, not financial advice</strong>, and says nothing about a
              token&apos;s contract code, liquidity or team.
            </div>
            <h3 className="dev-h3">Example</h3>
            <div className="dev-stack">
              <CodeBlock title="curl" code={curlExample(`/risk/eth/${SAMPLE_PATHS.token}`)} />
              <CodeBlock title="200 OK" code={json(SAMPLE_RISK_RESPONSE)} />
            </div>
          </section>

          {/* Errors */}
          <section id="errors" className="dev-doc-section">
            <h2 className="dev-h2">Errors</h2>
            <p className="dev-p">
              Errors use the HTTP status and a stable <code>code</code>. The <code>message</code> is written for humans and may change; branch on <code>code</code>.
            </p>
            <div className="dev-table-wrap" style={{ marginTop: 14 }}>
              <table className="dev-table">
                <thead><tr><th>Code</th><th>Status</th><th>Meaning</th></tr></thead>
                <tbody>
                  {ERRORS.map(e => (
                    <tr key={e.code}><td><code>{e.code}</code></td><td className="dev-mono">{e.status}</td><td>{e.meaning}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="dev-h3">Example</h3>
            <div className="dev-stack">
              <CodeBlock title="429 Too Many Requests" code={json(SAMPLE_ERROR_RESPONSE)} />
              <CodeBlock title="404 Not Found (no snapshot yet)" code={json(SAMPLE_NOT_INDEXED)} />
            </div>
          </section>

          {/* Limits */}
          <section id="limits" className="dev-doc-section">
            <h2 className="dev-h2">Rate limits &amp; quotas</h2>
            <p className="dev-p">
              Each plan has a per-minute rate limit and a monthly quota. Both are hard limits: at the quota you receive <code>429 quota_exceeded</code>{' '}
              until the period resets or you upgrade — there is no overage billing. Every authorized call counts as one, whichever endpoint it hits,
              including a <code>404 not_indexed</code> answer. Requests rejected before authentication (<code>400</code> for a bad chain or address, <code>401</code>) are not counted.
            </p>
            <div className="dev-table-wrap" style={{ marginTop: 14 }}>
              <table className="dev-table">
                <thead><tr><th>Plan</th><th>Calls / month</th><th>Calls / minute</th><th>Price</th></tr></thead>
                <tbody>
                  {API_PLANS.map(p => (
                    <tr key={p.tier}>
                      <td>{p.name}</td>
                      <td className="dev-mono">{fmtNum(p.monthlyQuota)}</td>
                      <td className="dev-mono">{p.perMinute}</td>
                      <td className="dev-mono">{p.priceMonthly === 0 ? 'Free' : `$${p.priceMonthly}/mo · $${fmtNum(p.priceYearly)}/yr`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="dev-h3">Headers</h3>
            <p className="dev-p">Sent on every authorized response, success or error:</p>
            <div className="dev-table-wrap" style={{ marginTop: 10 }}>
              <table className="dev-table">
                <thead><tr><th>Header</th><th>Meaning</th></tr></thead>
                <tbody>
                  {HEADERS.map(h => <tr key={h.name}><td><code>{h.name}</code></td><td>{h.meaning}</td></tr>)}
                </tbody>
              </table>
            </div>
            <p className="dev-p" style={{ marginTop: 14 }}>
              Monthly periods are calendar months in UTC. Usage per key and the reset date are on your <Link href="/developers/dashboard">dashboard</Link>.
            </p>
          </section>

          {/* Snapshots */}
          <section id="snapshots" className="dev-doc-section">
            <h2 className="dev-h2">Snapshots</h2>
            <p className="dev-p">
              BananaMaps builds a holder map by pulling a token&apos;s top 150 holders and replaying the transfers between them. That build takes a
              minute or two, so results are stored as a <strong style={{ color: 'var(--text)' }}>snapshot</strong> and refreshed in the background. The API serves snapshots; it never
              starts a build.
            </p>
            <ul className="dev-feats" style={{ marginTop: 14, maxWidth: 720 }}>
              <li><span><code>meta.computedAt</code> is when the snapshot was computed and <code>meta.snapshotAgeSeconds</code> how old it is at response time. Popular tokens refresh often; quiet ones less so.</span></li>
              <li><span>If no snapshot exists you get <code>404 not_indexed</code>. Open the token in the app once (the link is in the message) — the build runs, and the API answers from then on.</span></li>
              <li><span>The <code>labels</code> endpoint does not need a snapshot; it answers for any address.</span></li>
              <li><span>Responses are not cached by the API (<code>Cache-Control: no-store</code>), so you always see the newest snapshot; cache on your side as you see fit.</span></li>
            </ul>
          </section>

          {/* Embed quickstart */}
          <section id="embed" className="dev-doc-section">
            <div className="dev-eyebrow">BananaMaps Embed</div>
            <h2 className="dev-h2">Embed quickstart</h2>
            <p className="dev-p">
              BananaMaps Embed puts the live holder map on your own pages. Register your site in the <Link href="/developers/dashboard">dashboard</Link> to
              get a partner id, then paste this snippet where the map should appear:
            </p>
            <div className="dev-stack" style={{ marginTop: 14 }}>
              <CodeBlock title="HTML" code={embedSnippet()} />
              <div className="dev-note">
                <strong>First-party domains</strong> ({PUBLIC_FIRST_PARTY.join(', ')} and their subdomains) need no <code>pid</code>. <strong>Any other domain</strong> must
                pass a valid <code>pid</code> whose domain list matches the page, or visitors see a &ldquo;get a free Embed key&rdquo; message in place of the map.
                The frame is responsive: set <code>width</code> and <code>height</code> to fit your layout; 600 px tall works well.
              </div>
            </div>
          </section>

          <section id="embed-params" className="dev-doc-section">
            <h2 className="dev-h2">Embed parameters</h2>
            <div className="dev-table-wrap" style={{ marginTop: 14 }}>
              <table className="dev-table">
                <thead><tr><th>Parameter</th><th>Required</th><th>Description</th></tr></thead>
                <tbody>
                  {EMBED_PARAMS.map(p => <tr key={p.name}><td><code>{p.name}</code></td><td className="dev-mono">{p.req}</td><td>{p.meaning}</td></tr>)}
                </tbody>
              </table>
            </div>
            <ul className="dev-feats" style={{ marginTop: 16, maxWidth: 720 }}>
              <li><span><strong>Free plan:</strong> the &ldquo;Powered by BananaMaps&rdquo; badge and link are required and always shown; <code>badge</code> and <code>accent</code> are ignored.</span></li>
              <li><span><strong>Partner plan:</strong> <code>badge=0</code> and <code>accent</code> take effect. You can also save a default badge setting and accent per site in the dashboard, so the snippet stays short.</span></li>
              <li><span><strong>Domains:</strong> the id only works on the hostnames you listed (wildcards like <code>*.example.com</code> allowed). Leave the list empty while testing and lock it down before launch.</span></li>
              <li><span><strong>Refresh:</strong> maps come from the same snapshots as the API. Partner sites get priority refresh for the tokens their visitors open.</span></li>
              <li><span><strong>Metering:</strong> maps shown through BananaMaps Embed never count against your API quota.</span></li>
            </ul>
            <p className="dev-p" style={{ marginTop: 16 }}>
              Plans and pricing: <Link href="/developers/embed">BananaMaps Embed</Link>. Manage sites, badge and accent in the <Link href="/developers/dashboard">dashboard</Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
