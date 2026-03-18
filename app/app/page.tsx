'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Holder, initBubbles, stepPhysics, resolveCollisions, drawBubbles } from '@/lib/bubbleEngine';
import { fetchHolders } from '@/lib/fetchHolders';

function AppContent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const bubblesRef = useRef<Holder[]>([]);
  const hoveredRef = useRef<number>(-1);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(searchParams.get('token') || '');
  const [chain, setChain] = useState('eth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [stats, setStats] = useState({ mapped: 0, top10: 0, clusters: 0 });
  const [hovered, setHovered] = useState<Holder | null>(null);

  const startAnimation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const loop = () => {
      bubblesRef.current = stepPhysics(bubblesRef.current, canvas.width, canvas.height);
      bubblesRef.current = resolveCollisions(bubblesRef.current);
      drawBubbles(ctx, bubblesRef.current, canvas.width, canvas.height, hoveredRef.current);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
  }, []);

  const loadToken = useCallback(async (input: string) => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setTokenName('');
    cancelAnimationFrame(animRef.current);
    try {
      const { holders, chain: detectedChain, name } = await fetchHolders(input);
      if (!holders.length) { setError('No holders found.'); setLoading(false); return; }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      canvas.width = w;
      canvas.height = h;
      bubblesRef.current = initBubbles(holders, w, h);
      setChain(detectedChain);
      setTokenName(name);
      const top10pct = holders.slice(0, 10).reduce((s, h) => s + h.pct, 0);
      setStats({ mapped: holders.length, top10: Math.round(top10pct), clusters: 0 });
      startAnimation();
    } catch (e) {
      setError('Failed to load token data.');
    }
    setLoading(false);
  }, [startAnimation]);

  // Load token from URL on mount
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) loadToken(token);
  }, []);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Cleanup animation
  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  function doSearch() {
    const q = search.trim();
    if (!q) return;
    router.push(`/app?token=${encodeURIComponent(q)}`);
    loadToken(q);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let found = -1;
    bubblesRef.current.forEach((b, i) => {
      const dx = (b.x || 0) - mx, dy = (b.y || 0) - my;
      if (Math.sqrt(dx*dx + dy*dy) < (b.radius || 10)) found = i;
    });
    hoveredRef.current = found;
    setHovered(found >= 0 ? bubblesRef.current[found] : null);
  }

  const chainColors: Record<string, string> = { eth: '#627EEA', bsc: '#F3BA2F', sol: '#9945FF', base: '#0052FF' };
  const chainLabel: Record<string, string> = { eth: 'Ethereum', bsc: 'BSC', sol: 'Solana', base: 'Base' };

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)', height: 56, gap: 12, flexShrink: 0 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 18, textDecoration: 'none', color: 'var(--text)', flexShrink: 0 }}>
          <span>🍌</span>
          <span style={{ color: 'var(--text)' }}>Banana<span style={{ color: 'var(--banana)' }}>Maps</span></span>
        </Link>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {(['eth','bsc','sol','base'] as const).map(c => (
            <button key={c} onClick={() => setChain(c)} style={{ background: chain === c ? 'var(--surface2)' : 'var(--surface)', border: `1px solid ${chain === c ? chainColors[c] : 'var(--border2)'}`, color: chain === c ? chainColors[c] : 'var(--text2)', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Mono,monospace' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: chainColors[c], marginRight: 5 }} />{c.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '0 12px', gap: 8 }}>
          <span style={{ color: 'var(--text3)', fontSize: 14 }}>⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="Token address or name..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'DM Mono,monospace', fontSize: 12, padding: '10px 0' }} />
          <button onClick={doSearch} style={{ background: 'var(--banana)', color: '#000', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            {loading ? '...' : 'Analyze'}
          </button>
        </div>
      </nav>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Canvas area */}
        <div style={{ flex: 1, position: 'relative', background: 'var(--bg2)' }}>
          <canvas ref={canvasRef} onMouseMove={handleMouseMove} style={{ width: '100%', height: '100%', display: 'block', cursor: hovered ? 'pointer' : 'default' }} />

          {/* Empty state */}
          {!loading && !tokenName && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text3)', pointerEvents: 'none' }}>
              <div style={{ fontSize: 48 }}>🍌</div>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 13 }}>Search a token to get started</div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text2)', background: 'rgba(8,8,7,0.8)' }}>
              <div style={{ fontSize: 40, animation: 'spin 1s linear infinite' }}>🍌</div>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 13 }}>Loading holders...</div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FF4545', fontFamily: 'DM Mono,monospace', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Token pill */}
          {tokenName && (
            <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 20, padding: '5px 12px', fontFamily: 'DM Mono,monospace', fontSize: 11, color: chainColors[chain], display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: chainColors[chain], display: 'inline-block' }} />
                {chainLabel[chain]}
              </div>
              <div style={{ background: 'rgba(245,200,66,0.06)', border: '1px solid #C49A10', borderRadius: 20, padding: '5px 14px', fontFamily: 'DM Mono,monospace', fontSize: 12, color: 'var(--banana)' }}>
                {tokenName}
              </div>
            </div>
          )}

          {/* Hover tooltip */}
          {hovered && (
            <div style={{ position: 'absolute', bottom: 20, left: 20, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px', fontFamily: 'DM Mono,monospace', fontSize: 11 }}>
              <div style={{ color: 'var(--banana)', marginBottom: 4 }}>{hovered.address.slice(0,8)}...{hovered.address.slice(-6)}</div>
              <div style={{ color: 'var(--text2)' }}>Rank #{hovered.rank} · {hovered.pct.toFixed(3)}%</div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: 300, borderLeft: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Stats</div>
            <div style={{ display: 'flex', gap: 16 }}>
              {[['Mapped', stats.mapped || '—'], ['Top 10%', stats.top10 ? stats.top10 + '%' : '—'], ['Clusters', stats.clusters || '—']].map(([label, val]) => (
                <div key={label as string}>
                  <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 8, letterSpacing: '1px', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Holder list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {bubblesRef.current.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, height: '100%', color: 'var(--text3)' }}>
                <div style={{ fontSize: 32 }}>🍌</div>
                <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 12 }}>Select a token to explore</div>
              </div>
            ) : (
              bubblesRef.current.map((h, i) => (
                <div key={h.address} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  onMouseEnter={() => { hoveredRef.current = i; setHovered(h); }}
                  onMouseLeave={() => { hoveredRef.current = -1; setHovered(null); }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--banana)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#000', flexShrink: 0 }}>{h.rank}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.address.slice(0,8)}...{h.address.slice(-6)}</div>
                    <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{h.pct.toFixed(3)}%</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default function AppPage() {
  return <Suspense><AppContent /></Suspense>;
}
