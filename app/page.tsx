'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Ticker from './components/Ticker';
import SiteNav from './components/SiteNav';
import SiteFooter from './components/SiteFooter';
import TrendingGrid from './components/TrendingGrid';

export default function Home() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  function launch(token?: string) {
    const q = token || query.trim();
    if (!q) return;
    router.push(`/app?token=${encodeURIComponent(q)}`);
  }

  return (
    <div className="bm-page">
      <Ticker />
      <SiteNav />

      <main className="bm-main">
        {/* Hero */}
        <section className="hero">
          <div className="hero-banana" aria-hidden>🍌</div>

          <h1 className="hero-title">
            See Who Really<br /><span style={{ color: 'var(--banana)' }}>Holds the Bag</span>
          </h1>

          <p className="hero-sub">
            BananaMaps visualizes token holder distribution across Ethereum, BSC, Solana, Base and Robinhood Chain — exposing clusters, whales, and suspicious wallet behaviour in seconds.
          </p>

          {/* Search */}
          <div className="hero-search-wrap">
            <div className="hero-search">
              <span style={{ color: 'var(--text3)', fontSize: 16 }} aria-hidden>⌕</span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && launch()}
                type="text"
                placeholder="Token name or contract address..."
                aria-label="Token name or contract address"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button type="button" onClick={() => launch()} className="analyze-btn">Search Token 🍌</button>
          </div>

          <p className="hero-hint">
            Paste a contract address or search by name — or <a href="#trending" className="nowrap">pick a trending token ↓</a>
          </p>
        </section>

        {/* Trending now — real data from /api/trending */}
        <TrendingGrid />

        {/* CTA */}
        <section className="home-cta">
          <div className="home-cta-card">
            <h2 className="home-cta-title">Ready to look under the hood?</h2>
            <p className="home-cta-sub">Open any token and get an interactive map of its top holders, their transfers and their clusters.</p>
            <Link href="/app" className="cta-btn">Launch App →</Link>
            <p className="home-cta-note"><span className="nowrap">Free to use</span> · <span className="nowrap">No wallet required</span> · <span className="nowrap">Real on-chain data</span></p>
            <p className="home-cta-more"><Link href="/about">How BananaMaps works →</Link></p>
          </div>
        </section>
      </main>

      <SiteFooter />

      {/* Theme B "Studio": flat surfaces, no decorative motion. Fonts inherit Inter
          from body; the accent appears only on the headline phrase and primary buttons. */}
      <style>{`
        .hero {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          padding: 56px 16px 40px;
        }
        .hero-banana { font-size: 56px; line-height: 1; margin-bottom: 16px; }
        .hero-title { font-size: clamp(34px, 5.5vw, 68px); font-weight: 800; letter-spacing: -1.5px; line-height: 1.08; margin-bottom: 18px; max-width: 780px; }
        .hero-sub { font-size: 17px; color: var(--text2); max-width: 560px; line-height: 1.65; margin-bottom: 32px; }
        .hero-search-wrap { display: flex; gap: 10px; width: 100%; max-width: 580px; margin-bottom: 14px; }
        .hero-search {
          flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;
          background: var(--surface); border: 1px solid var(--border2); border-radius: 7px; padding: 0 14px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .hero-search:focus-within { border-color: var(--banana); box-shadow: 0 0 0 3px color-mix(in srgb, var(--banana) 25%, transparent); }
        .hero-search input {
          background: none; border: none; outline: none; color: var(--text); width: 100%; min-width: 0;
          font-family: inherit; font-size: 14px; padding: 13px 0;
        }
        .hero-search input::placeholder { color: var(--text3); }
        .analyze-btn {
          background: var(--banana); color: var(--banana-ink); border: 1px solid var(--banana); border-radius: 7px; padding: 0 22px;
          font-family: inherit; font-weight: 700; font-size: 14px; cursor: pointer; white-space: nowrap;
          transition: background 0.15s, border-color 0.15s;
        }
        .analyze-btn:hover { background: #FFD35A; border-color: #FFD35A; }
        .analyze-btn:focus-visible, .cta-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--banana); }
        .hero-hint { font-size: 13px; color: var(--text2); line-height: 1.7; }
        .nowrap { white-space: nowrap; }
        .hero-hint a { color: var(--text); text-decoration: none; border-bottom: 1px solid var(--border2); transition: border-color 0.15s; }
        .hero-hint a:hover { border-color: var(--text); }
        .home-cta { padding: 8px 16px 64px; display: flex; justify-content: center; }
        .home-cta-card {
          width: 100%; max-width: 1100px; text-align: center; padding: 44px 24px 40px;
          background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
        }
        .home-cta-title { font-size: clamp(22px, 3vw, 30px); font-weight: 800; letter-spacing: -0.6px; margin-bottom: 10px; }
        .home-cta-sub { font-size: 14px; color: var(--text2); max-width: 520px; margin: 0 auto 26px; line-height: 1.6; }
        .cta-btn {
          display: inline-block; background: var(--banana); color: var(--banana-ink); border: 1px solid var(--banana); border-radius: 7px; padding: 13px 40px;
          font-family: inherit; font-weight: 700; font-size: 15px; cursor: pointer; text-decoration: none;
          transition: background 0.15s, border-color 0.15s;
        }
        .cta-btn:hover { background: #FFD35A; border-color: #FFD35A; }
        .home-cta-note { font-size: 13px; color: var(--text2); margin-top: 14px; line-height: 1.7; }
        .home-cta-more { margin-top: 8px; font-size: 13px; }
        .home-cta-more a { color: var(--text2); text-decoration: none; transition: color 0.15s; }
        .home-cta-more a:hover { color: var(--text); }
        @media (max-width: 768px) {
          .hero { padding: 44px 16px 32px; }
          .hero-banana { font-size: 48px; }
          .hero-sub { font-size: 15px; margin-bottom: 26px; }
          .hero-search-wrap { flex-direction: column; max-width: 100%; }
          .analyze-btn { padding: 13px; width: 100%; }
          .home-cta { padding-bottom: 48px; }
          .home-cta-card { padding: 34px 18px 32px; }
          .cta-btn { padding: 13px 32px; }
        }
      `}</style>
    </div>
  );
}
