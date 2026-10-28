'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Ticker from './components/Ticker';
import SiteNav from './components/SiteNav';
import SiteFooter from './components/SiteFooter';
import TrendingGrid from './components/TrendingGrid';

type Banana = { id: number; left: number; top: number; size: number; delay: number; duration: number; rotate: number; opacity: number };

export default function Home() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const [bananas, setBananas] = useState<Banana[]>([]);

  useEffect(() => {
    setBananas(Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 18 + Math.random() * 32,
      delay: Math.random() * 6,
      duration: 4 + Math.random() * 5,
      rotate: Math.random() * 360,
      opacity: 0.06 + Math.random() * 0.1,
    })));
  }, []);

  function launch(token?: string) {
    const q = token || query.trim();
    if (!q) return;
    router.push(`/app?token=${encodeURIComponent(q)}`);
  }

  return (
    <div className="bm-page">

      {/* Grain overlay */}
      <div className="bm-grain" aria-hidden />

      {/* Floating bananas */}
      {bananas.map((b) => (
        <div key={b.id} aria-hidden style={{
          position: 'fixed',
          left: `${b.left}%`,
          top: `${b.top}%`,
          fontSize: `${b.size}px`,
          opacity: b.opacity,
          animation: `bobble ${b.duration}s ${b.delay}s ease-in-out infinite`,
          pointerEvents: 'none',
          zIndex: 0,
          '--rot': `${b.rotate}deg`,
        } as React.CSSProperties}>🍌</div>
      ))}

      <Ticker />
      <SiteNav />

      <main className="bm-main">
        {/* Hero */}
        <section className="hero">
          <div className="hero-glow" aria-hidden />

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

      <style>{`
        @keyframes bobble {
          0%, 100% { transform: translateY(0px) rotate(var(--rot)) scale(1); }
          50% { transform: translateY(-20px) rotate(calc(var(--rot) + 15deg)) scale(1.15); }
        }
        .hero {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          padding: 56px 16px 40px; position: relative; overflow: hidden;
        }
        .hero-glow {
          position: absolute; width: 700px; height: 700px; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, rgba(245,200,66,0.07) 0%, transparent 70%);
          top: 50%; left: 50%; transform: translate(-50%, -50%);
        }
        .hero-banana { font-size: 60px; margin-bottom: 16px; display: inline-block; animation: bm-wobble 4s ease-in-out infinite; position: relative; }
        .hero-title { font-size: clamp(34px, 5.5vw, 68px); font-weight: 800; letter-spacing: -2px; line-height: 1.08; margin-bottom: 18px; max-width: 780px; position: relative; }
        .hero-sub { font-size: 17px; color: var(--text2); max-width: 560px; line-height: 1.65; margin-bottom: 32px; position: relative; }
        .hero-search-wrap { display: flex; gap: 10px; width: 100%; max-width: 580px; margin-bottom: 14px; position: relative; }
        .hero-search {
          flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;
          background: var(--surface); border: 1px solid var(--border2); border-radius: 10px; padding: 0 16px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .hero-search:focus-within { border-color: rgba(245,200,66,0.6); box-shadow: 0 0 0 3px rgba(245,200,66,0.08); }
        .hero-search input {
          background: none; border: none; outline: none; color: var(--text); width: 100%; min-width: 0;
          font-family: 'Bricolage Grotesque', sans-serif; font-size: 14px; padding: 14px 0;
        }
        .hero-search input::placeholder { color: var(--text2); opacity: 0.9; }
        .analyze-btn { background: var(--banana); color: #000; border: none; border-radius: 10px; padding: 0 24px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 14px; cursor: pointer; white-space: nowrap; transition: background 0.15s; }
        .analyze-btn:hover { background: #ffd45a; }
        .hero-hint { font-family: 'Bricolage Grotesque', sans-serif; font-size: 13px; color: var(--text2); position: relative; line-height: 1.7; }
        .nowrap { white-space: nowrap; }
        .hero-hint a { color: var(--text); text-decoration: none; border-bottom: 1px solid var(--border2); }
        .hero-hint a:hover { color: var(--banana); border-color: var(--banana); }
        .home-cta { padding: 8px 16px 64px; display: flex; justify-content: center; }
        .home-cta-card {
          width: 100%; max-width: 1100px; text-align: center; padding: 44px 24px 40px;
          background: linear-gradient(180deg, rgba(245,200,66,0.06), rgba(245,200,66,0.015)); border: 1px solid var(--border2); border-radius: 18px;
        }
        .home-cta-title { font-size: clamp(22px, 3vw, 30px); font-weight: 800; letter-spacing: -0.6px; margin-bottom: 10px; }
        .home-cta-sub { font-size: 14px; color: var(--text2); max-width: 520px; margin: 0 auto 26px; line-height: 1.6; }
        .cta-btn { display: inline-block; background: var(--banana); color: #000; border: none; border-radius: 10px; padding: 15px 44px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 16px; cursor: pointer; text-decoration: none; transition: background 0.15s, transform 0.15s; }
        .cta-btn:hover { background: #ffd45a; transform: translateY(-1px); }
        .home-cta-note { font-family: 'Bricolage Grotesque', sans-serif; font-size: 13px; color: var(--text2); margin-top: 14px; line-height: 1.7; }
        .home-cta-more { margin-top: 8px; font-size: 13px; }
        .home-cta-more a { color: var(--text2); text-decoration: none; }
        .home-cta-more a:hover { color: var(--banana); }
        @media (max-width: 768px) {
          .hero { padding: 44px 16px 32px; }
          .hero-banana { font-size: 48px; }
          .hero-sub { font-size: 15px; margin-bottom: 26px; }
          .hero-search-wrap { flex-direction: column; max-width: 100%; }
          .analyze-btn { padding: 14px; width: 100%; }
          .home-cta { padding-bottom: 48px; }
          .home-cta-card { padding: 34px 18px 32px; }
          .cta-btn { padding: 14px 32px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-banana { animation: none; }
          .cta-btn:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}
