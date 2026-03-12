'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function AppContent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(searchParams.get('token') || '');
  const [chain, setChain] = useState('eth');

  function doSearch() {
    const q = search.trim();
    if (!q) return;
    router.push(`/app?token=${encodeURIComponent(q)}`);
  }

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)', height: 56, gap: 12, flexShrink: 0 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 18, textDecoration: 'none', color: 'var(--text)', flexShrink: 0 }}>
          <span>🍌</span>
          <span className="logo-text-hide">Banana<span style={{ color: 'var(--banana)' }}>Maps</span></span>
        </Link>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {[['eth','ETH','#627EEA'],['bsc','BSC','#F3BA2F'],['sol','SOL','#9945FF'],['base','Base','#0052FF']].map(([id,label,color]) => (
            <button key={id} onClick={() => setChain(id as string)} style={{ background: chain === id ? 'var(--surface2)' : 'var(--surface)', border: `1px solid ${chain === id ? color : 'var(--border2)'}`, color: chain === id ? color : 'var(--text2)', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono,monospace', transition: 'all 0.15s' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color as string, marginRight: 5 }} />{label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '0 12px', gap: 8 }}>
          <span style={{ color: 'var(--text3)', fontSize: 14 }}>⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Token address or name (e.g. PEPE or 0x1f98...)"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'DM Mono,monospace', fontSize: 12, padding: '10px 0' }}
          />
          <button onClick={doSearch} style={{ background: 'var(--banana)', color: '#000', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>Analyze</button>
        </div>
      </nav>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', background: 'var(--bg2)' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text3)' }}>
            <div style={{ fontSize: 48 }}>🍌</div>
            <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 13 }}>
              {searchParams.get('token') ? `Loading ${searchParams.get('token')}...` : 'Search a token to get started'}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ width: 300, borderLeft: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>HOLDERS</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[['MAPPED','—'],['TOP 10','—'],['CLUSTERS','—']].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 8, letterSpacing: '1px', color: 'var(--text3)', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 15, color: 'var(--text)' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text3)' }}>
            <div style={{ fontSize: 32 }}>🍌</div>
            <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>Select a token to explore</div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .logo-text-hide { display: none; }
        }
      `}</style>
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
