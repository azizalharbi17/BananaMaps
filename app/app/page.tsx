'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AppContent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [search, setSearch] = useState(token);

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid var(--border)', height: 56, gap: 16, flexShrink: 0 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 19, textDecoration: 'none', color: 'var(--text)', flexShrink: 0 }}>
          <span>🍌</span>
          <span>Banana<span style={{ color: 'var(--banana)' }}>Maps</span></span>
        </Link>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {['ETH','BSC','SOL','Base'].map(c => (
            <button key={c} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono,monospace' }}>{c}</button>
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '0 12px', gap: 8 }}>
          <span style={{ color: 'var(--text3)' }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Token address or name..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'DM Mono,monospace', fontSize: 12, padding: '10px 0' }} />
          <button style={{ background: 'var(--banana)', color: '#000', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Analyze</button>
        </div>
      </nav>
      {/* Canvas */}
      <div style={{ flex: 1, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🍌</div>
          <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 13 }}>
            {token ? `Loading ${token}...` : 'Search a token to get started'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppPage() {
  return (
    <Suspense>
      <AppContent />
    </Suspense>
  );
}
