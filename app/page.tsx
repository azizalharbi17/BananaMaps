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
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 40px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 19 }}>
          <span>🍌</span>
          <span>Banana<span style={{ color: 'var(--banana)' }}>Maps</span></span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/app"><button style={{ background: 'var(--banana)', border: 'none', color: '#000', borderRadius: 7, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Launch App →</button></Link>
        </div>
      </nav>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>🍌</div>
        <h1 style={{ fontSize: 'clamp(32px,5.5vw,68px)', fontWeight: 800, letterSpacing: -2, lineHeight: 1.1, marginBottom: 18 }}>
          See Who Really<br /><span style={{ color: 'var(--banana)' }}>Holds the Bag</span>
        </h1>
        <p style={{ fontSize: 17, color: 'var(--text2)', maxWidth: 520, lineHeight: 1.65, marginBottom: 36 }}>
          BananaMaps visualizes token holder distribution across Ethereum, BSC, Solana and Base.
        </p>
        <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 560, marginBottom: 14 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && launch()} placeholder="Token name or contract address..." style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '14px 16px', color: 'var(--text)', fontFamily: 'DM Mono,monospace', fontSize: 13, outline: 'none' }} />
          <button onClick={() => launch()} style={{ background: 'var(--banana)', color: '#000', border: 'none', borderRadius: 10, padding: '0 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Analyze 🍌</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 48 }}>
          {['PEPE','SHIB','BONK','WIF','BRETT','CAKE'].map(t => (
            <button key={t} onClick={() => launch(t)} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 20, padding: '8px 16px', fontFamily: 'DM Mono,monospace', fontSize: 12, cursor: 'pointer' }}>{t}</button>
          ))}
        </div>
      </div>
      <footer style={{ padding: '20px 40px', borderTop: '1px solid var(--border)', fontFamily: 'DM Mono,monospace', fontSize: 11, color: 'var(--text3)', display: 'flex', justifyContent: 'space-between' }}>
        <span>© 2026 BananaMaps</span>
        <div style={{ display: 'flex', gap: 20 }}><span>Docs</span><span>Pricing</span></div>
      </footer>
    </div>
  );
}
