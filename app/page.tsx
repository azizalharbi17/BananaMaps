'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  function launch(token?: string) {
    const q = token || query.trim();
    if (!q) return;
    router.push(`/app?token=${encodeURIComponent(q)}`);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Grain overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
        opacity: 0.025,
      }} />

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px max(12px, env(safe-area-inset-left)) 14px max(12px, env(safe-area-inset-right))', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 19, cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
          <span style={{ fontSize: 22, display: 'inline-block', animation: 'wobble 4s ease-in-out infinite' }}>🍌</span>
          <span style={{ color: 'var(--text)' }}>Banana<span style={{ color: 'var(--banana)' }}>Maps</span></span>
        </a>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="nav-link-home nav-hide-mobile">Watchlist</span>
          
          <button className="pro-btn-home nav-hide-mobile" onClick={() => {}}>🍌 Go Pro</button>
          <button className="login-btn-home nav-hide-mobile" onClick={() => router.push("/login")}>Log in</button>
          <button className="signup-btn-home nav-hide-mobile" onClick={() => router.push("/signup")}>Sign up</button>
          <Link href="/app">
            <button className="launch-btn-home">Launch App →</button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '60px 24px 40px', textAlign: 'center', position: 'relative',
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(245,200,66,0.06) 0%,transparent 70%)',
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none',
        }} />

        <div style={{ fontSize: 60, marginBottom: 16, display: 'inline-block', animation: 'wobble 4s ease-in-out infinite' }}>🍌</div>

        <h1 style={{
          fontSize: 'clamp(32px, 5.5vw, 68px)', fontWeight: 800, letterSpacing: -2,
          lineHeight: 1.1, marginBottom: 18, maxWidth: 780,
        }}>
          See Who Really<br /><span style={{ color: 'var(--banana)' }}>Holds the Bag</span>
        </h1>

        <p style={{ fontSize: 17, color: 'var(--text2)', maxWidth: 520, lineHeight: 1.65, marginBottom: 36 }}>
          BananaMaps visualizes token holder distribution across Ethereum, BSC, Solana and Base — exposing clusters, whales, and suspicious wallet behaviour in seconds.
        </p>

        {/* Search */}
        <div className="hero-search-wrap">
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', background: 'var(--surface)',
            border: '1px solid var(--border2)', borderRadius: 10, padding: '0 16px', gap: 8,
          }}>
            <span style={{ color: 'var(--text3)', fontSize: 16 }}>⌕</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && launch()}
              type="text"
              placeholder="Token name or contract address..."
              style={{
                background: 'none', border: 'none', outline: 'none', color: 'var(--text)',
                fontFamily: "'DM Mono', monospace", fontSize: 13, padding: '14px 0', width: '100%',
              }}
            />
          </div>
          <button onClick={() => launch()} className="analyze-btn">Search Token 🍌</button>
        </div>

        {/* Quick tokens */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 56 }}>
          {['PEPE','SHIB','BONK','WIF','BRETT','CAKE'].map(t => (
            <button key={t} onClick={() => launch(t)} className="ql-btn">{t}</button>
          ))}
        </div>

        {/* Feature cards */}
        <div className="feat-grid">
          {[
            { icon: '🐋', title: 'Whale Detection', desc: 'Instantly spot large holders and track their movements.' },
            { icon: '🔗', title: 'Cluster Analysis', desc: 'Identify wallets funded from the same source — classic rug setup.' },
            { icon: '📡', title: 'Live On-Chain Data', desc: 'Real-time on-chain data, always up to date.' },
            { icon: '⚡', title: 'Multi-Chain', desc: 'ETH, BSC, Solana and Base — all in one place.' },
          ].map(card => (
            <div key={card.title} className="feat-card">
              <div style={{ fontSize: 26, marginBottom: 10 }}>{card.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 5 }}>{card.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{card.desc}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link href="/app">
          <button className="cta-btn">Launch App →</button>
        </Link>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text3)', marginTop: 12 }}>
          Free to use · No wallet required · Real on-chain data
        </p>
      </div>

      {/* Footer */}
      <footer style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 40px', borderTop: '1px solid var(--border)',
        fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text3)',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div>© 2026 BananaMaps</div>
        <div style={{ display: 'flex', gap: 20 }}>
        </div>
      </footer>

      <style>{`
        @keyframes wobble {
          0%,100% { transform: rotate(-8deg) scale(1); }
          25% { transform: rotate(6deg) scale(1.1); }
          50% { transform: rotate(-4deg) scale(1); }
          75% { transform: rotate(8deg) scale(1.05); }
        }
        .nav-link-home { color: var(--text3); font-size: 13px; font-weight: 500; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: color 0.15s; }
        .nav-link-home:hover { color: var(--text2); }
        .pro-btn-home { background: var(--banana); color: #000; border: none; border-radius: 6px; padding: 7px 14px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 13px; cursor: pointer; }
        .login-btn-home { background: none; border: 1px solid var(--border2); color: var(--text); border-radius: 7px; padding: 7px 16px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 600; font-size: 13px; cursor: pointer; }
        .signup-btn-home { background: var(--banana); border: none; color: #000; border-radius: 7px; padding: 7px 16px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 13px; cursor: pointer; }
        .launch-btn-home { background: var(--surface); border: 1px solid var(--border2); color: var(--text); border-radius: 7px; padding: 7px 16px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 13px; cursor: pointer; }
        .hero-search-wrap { display: flex; gap: 10px; width: 100%; max-width: 560px; margin-bottom: 14px; }
        .analyze-btn { background: var(--banana); color: #000; border: none; border-radius: 10px; padding: 0 24px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 14px; cursor: pointer; white-space: nowrap; }
        .ql-btn { background: var(--surface); border: 1px solid var(--border2); color: var(--text2); border-radius: 20px; padding: 8px 16px; font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; transition: border-color 0.15s, color 0.15s; }
        .ql-btn:hover { border-color: var(--banana); color: var(--banana); }
        .feat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; width: 100%; max-width: 880px; margin-bottom: 48px; }
        .feat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 22px; text-align: left; }
        .cta-btn { background: var(--banana); color: #000; border: none; border-radius: 10px; padding: 15px 44px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 16px; cursor: pointer; }
        @media (max-width: 768px) {
          nav { padding: 14px 16px !important; }
          .nav-link-home, .pro-btn-home { display: none; }
          .login-btn-home, .signup-btn-home { padding: 6px 10px; font-size: 12px; }
          .launch-btn-home { padding: 6px 10px; font-size: 12px; }
          .hero-search-wrap { flex-direction: column; max-width: 100%; }
          .analyze-btn { padding: 14px; width: 100%; }
          footer { padding: 20px 16px !important; flex-direction: column; text-align: center; }
        }
      `}</style>
    </div>
  );
}