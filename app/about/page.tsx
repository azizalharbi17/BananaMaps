import type { Metadata } from 'next';
import Link from 'next/link';
import Ticker from '../components/Ticker';
import SiteNav from '../components/SiteNav';
import SiteFooter from '../components/SiteFooter';
import { CHAINS } from '../components/chains';

export const metadata: Metadata = {
  title: 'About — BananaMaps',
  description:
    'BananaMaps maps a token\'s top holders and the transfers between them into clusters, whales and labeled exchanges — across Ethereum, BSC, Solana, Base and Robinhood Chain.',
};

const FEATURES = [
  { icon: '🐋', title: 'Whale Detection', desc: 'Top 150 holders mapped with real transfer flows between them.' },
  { icon: '🔗', title: 'Cluster Analysis', desc: 'Connected-wallet clusters from on-chain transfers — classic rug setup, exposed.' },
  { icon: '🏦', title: 'Exchange Labeling', desc: 'Binance, Bybit, Coinbase and 250+ known wallets identified and separated.' },
  { icon: '⚡', title: 'Multi-Chain', desc: 'ETH, BSC, Solana, Base and Robinhood Chain — snapshots refresh automatically.' },
];

const STEPS = [
  { n: '01', title: 'Holders', desc: 'We pull the token\'s top 150 holders straight from the chain and size every wallet by its share of supply.' },
  { n: '02', title: 'Transfer histories', desc: 'We replay the transfer history between those wallets to see who funded whom — and when.' },
  { n: '03', title: 'Clusters', desc: 'Wallets that move tokens between each other collapse into clusters. Exchanges and known entities are labeled and set apart.' },
];

const STATS = [
  { value: '5', label: 'chains' },
  { value: '150', label: 'top holders per map' },
  { value: '250+', label: 'labeled wallets' },
  { value: '~2 min', label: 'first map build' },
];

export default function AboutPage() {
  return (
    <div className="bm-page">
      <Ticker />
      <SiteNav />

      <main className="bm-main about-main">
        {/* Hero */}
        <section className="about-hero">
          <div className="about-eyebrow">About BananaMaps</div>
          <h1 className="about-title">
            Holder maps for people who read <span style={{ color: 'var(--banana)' }}>the chain</span>, not the chart.
          </h1>
          <p className="about-lead">
            BananaMaps turns a token&apos;s top holders into a living map. Every wallet is a bubble sized by its share of supply,
            every transfer between holders is a line, and wallets that move tokens between each other collapse into clusters —
            so a &ldquo;decentralised&rdquo; launch controlled by one team shows up as one blob.
          </p>
          <p className="about-lead about-lead-2">
            It&apos;s built for traders doing due diligence before a buy, researchers tracing insider wallets, and token teams
            who want to prove their distribution is clean. Free to use, no wallet required, real on-chain data.
          </p>
          <div className="about-actions">
            <Link href="/app" className="bm-btn bm-btn-primary about-btn-lg">Launch App →</Link>
            <Link href="/" className="bm-btn bm-btn-ghost about-btn-lg">Search a token</Link>
          </div>
          <dl className="about-stats">
            {STATS.map(s => (
              <div key={s.label} className="about-stat">
                <dd>{s.value}</dd>
                <dt>{s.label}</dt>
              </div>
            ))}
          </dl>
        </section>

        {/* Features */}
        <section className="about-section" aria-labelledby="about-features">
          <h2 id="about-features" className="about-h2">What you get</h2>
          <div className="feat-grid">
            {FEATURES.map(card => (
              <div key={card.title} className="feat-card">
                <div className="feat-icon" aria-hidden>{card.icon}</div>
                <div className="feat-title">{card.title}</div>
                <div className="feat-desc">{card.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="about-section" aria-labelledby="about-how">
          <h2 id="about-how" className="about-h2">How it works</h2>
          <ol className="about-steps">
            {STEPS.map((s, i) => (
              <li key={s.n} className="about-step">
                <div className="about-step-n">{s.n}</div>
                <div>
                  <div className="about-step-title">{s.title}</div>
                  <div className="about-step-desc">{s.desc}</div>
                </div>
                {i < STEPS.length - 1 && <div className="about-step-arrow" aria-hidden>→</div>}
              </li>
            ))}
          </ol>
          <div className="about-chains-label">Chains supported</div>
          <div className="about-chains">
            {CHAINS.map(c => (
              <span key={c.id} className="about-chain">
                <span className="about-chain-dot" style={{ background: c.color }} aria-hidden />
                {c.label}
              </span>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="about-cta">
          <h2 className="about-cta-title">Ready to see who holds the bag?</h2>
          <Link href="/app" className="cta-btn">Launch App →</Link>
          <p className="about-cta-note"><span className="nowrap">Free to use</span> · <span className="nowrap">No wallet required</span> · <span className="nowrap">Real on-chain data</span></p>
        </section>
      </main>

      <SiteFooter />

      {/* Theme B "Studio": flat surfaces, sentence-case labels in --text2, no decorative
          motion. Fonts inherit Inter from body; the accent is reserved for the headline
          phrase and the primary buttons. */}
      <style>{`
        .about-main { align-items: center; }
        .about-hero { width: 100%; max-width: 860px; padding: 64px 16px 36px; text-align: center; }
        .about-eyebrow { font-size: 12px; font-weight: 600; color: var(--text2); margin-bottom: 18px; }
        .about-title { font-size: clamp(32px, 5vw, 56px); font-weight: 800; letter-spacing: -1.5px; line-height: 1.08; margin-bottom: 22px; }
        .about-lead { font-size: 17px; color: var(--text2); line-height: 1.7; max-width: 720px; margin: 0 auto 14px; }
        .about-lead-2 { color: var(--text2); opacity: 0.85; margin-bottom: 30px; }
        .about-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 40px; }
        .about-btn-lg { padding: 11px 22px; font-size: 14px; border-radius: 7px; }
        .about-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; max-width: 760px; margin: 0 auto; }
        .about-stat { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 10px; }
        .about-stat dd { font-size: 24px; font-weight: 800; color: var(--text); letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
        .about-stat dt { font-size: 12.5px; color: var(--text2); margin-top: 4px; }
        .about-section { width: 100%; max-width: 960px; padding: 40px 16px 8px; }
        .about-h2 { font-size: 24px; font-weight: 800; letter-spacing: -0.6px; margin-bottom: 18px; }
        .feat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; width: 100%; }
        .feat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 22px; text-align: left; transition: border-color 0.15s; }
        .feat-card:hover { border-color: var(--border2); }
        .feat-icon { font-size: 26px; margin-bottom: 10px; }
        .feat-title { font-weight: 700; font-size: 14px; margin-bottom: 5px; }
        .feat-desc { font-size: 12px; color: var(--text2); line-height: 1.5; }
        .about-steps { list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 26px; }
        .about-step { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 22px; display: flex; flex-direction: column; gap: 12px; }
        .about-step-n { font-size: 12px; font-weight: 600; color: var(--text2); font-variant-numeric: tabular-nums; }
        .about-step-title { font-weight: 700; font-size: 15px; margin-bottom: 6px; }
        .about-step-desc { font-size: 12.5px; color: var(--text2); line-height: 1.55; }
        .about-step-arrow { position: absolute; right: -14px; top: 50%; transform: translateY(-50%); width: 16px; text-align: center; color: var(--text3); font-size: 13px; background: var(--bg); line-height: 1; }
        .about-chains-label { font-size: 12px; font-weight: 600; color: var(--text2); margin-bottom: 10px; }
        .about-chains { display: flex; gap: 8px; flex-wrap: wrap; }
        .about-chain { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface); font-size: 12px; font-weight: 600; color: var(--text); }
        .about-chain-dot { width: 7px; height: 7px; border-radius: 50%; }
        .about-cta { width: 100%; max-width: 960px; padding: 56px 16px 72px; text-align: center; }
        .about-cta-title { font-size: clamp(22px, 3vw, 30px); font-weight: 800; letter-spacing: -0.6px; margin-bottom: 22px; }
        .cta-btn {
          display: inline-block; background: var(--banana); color: var(--banana-ink); border: 1px solid var(--banana); border-radius: 7px; padding: 13px 40px;
          font-weight: 700; font-size: 15px; text-decoration: none; transition: background 0.15s, border-color 0.15s;
        }
        .cta-btn:hover { background: #FFD35A; border-color: #FFD35A; }
        .cta-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--banana); }
        .about-cta-note { font-size: 13px; color: var(--text2); margin-top: 14px; line-height: 1.7; }
        .nowrap { white-space: nowrap; }
        @media (max-width: 768px) {
          .about-hero { padding: 44px 16px 28px; }
          .about-lead { font-size: 15px; }
          .about-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .about-steps { grid-template-columns: 1fr; }
          .about-step-arrow { display: none; }
          .about-section { padding-top: 30px; }
          .about-cta { padding: 40px 16px 56px; }
          .cta-btn { padding: 13px 32px; }
        }
      `}</style>
    </div>
  );
}
