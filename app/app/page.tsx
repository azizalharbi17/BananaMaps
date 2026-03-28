'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Holder, initBubbles, detectClusters, applyForces, drawBubbles, CLUSTER_COLORS } from '@/lib/bubbleEngine';
import { fetchHolders } from '@/lib/fetchHolders';

function AppContent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const bubblesRef = useRef<Holder[]>([]);
  const hoveredRef = useRef<number>(-1);
  const selectedRef = useRef<number>(-1);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(searchParams.get('token') || '');
  const [chain, setChain] = useState('eth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [stats, setStats] = useState({ mapped: 0, top10: 0, clusters: 0 });
  const [hovered, setHovered] = useState<Holder | null>(null);
  const [selected, setSelected] = useState<Holder | null>(null);
  const [selectedPos, setSelectedPos] = useState({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const worldSizeRef = useRef({ w: 1200, h: 800 });

  const startAnimation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    cancelAnimationFrame(animRef.current);
    const { w, h } = worldSizeRef.current;
    const loop = () => {
      bubblesRef.current = applyForces(bubblesRef.current, w, h);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(offsetRef.current.x, offsetRef.current.y);
      ctx.scale(scaleRef.current, scaleRef.current);
      drawBubbles(ctx, bubblesRef.current, w, h, hoveredRef.current, selectedRef.current);
      ctx.restore();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
  }, []);

  const loadToken = useCallback(async (input: string) => {
    if (!input.trim()) return;
    setLoading(true); setError(''); setTokenName(''); setTokenSymbol('');
    setSelected(null); selectedRef.current = -1;
    cancelAnimationFrame(animRef.current);
    try {
      const res = await fetch(`/api/holders?address=${encodeURIComponent(input)}&chain=${chain}`);

      // Try to resolve token first
      const { KNOWN_TOKENS } = await import('@/lib/constants');
      const upper = input.toUpperCase().trim();
      const known = KNOWN_TOKENS[upper];
      const address = known?.address || input;
      const detectedChain = known?.chain || chain;

      const apiRes = await fetch(`/api/holders?address=${encodeURIComponent(address)}&chain=${detectedChain}`);
      const data = await apiRes.json();
      const holders = data.holders || [];

      if (!holders.length) { setError('No holders found.'); setLoading(false); return; }
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      worldSizeRef.current = { w, h };
      offsetRef.current = { x: 0, y: 0 };
      scaleRef.current = 1;
      const initialized = initBubbles(holders, w, h);
      const clustered = detectClusters(initialized);
      bubblesRef.current = clustered;
      setChain(detectedChain);
      setTokenName(data.name || known?.name || input);
      setTokenSymbol(data.symbol || '');
      const top10pct = holders.slice(0, 10).reduce((s: number, h: Holder) => s + h.pct, 0);
      const clusterCount = new Set(clustered.map(b => b.cluster).filter(c => c !== undefined)).size;
      setStats({ mapped: holders.length, top10: Math.round(top10pct), clusters: clusterCount });
      startAnimation();
    } catch (e) {
      setError('Failed to load token data.');
    }
    setLoading(false);
  }, [chain, startAnimation]);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) loadToken(token);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      const newScale = Math.min(Math.max(scaleRef.current * zoomFactor, 0.15), 6);
      offsetRef.current.x = mx - (mx - offsetRef.current.x) * (newScale / scaleRef.current);
      offsetRef.current.y = my - (my - offsetRef.current.y) * (newScale / scaleRef.current);
      scaleRef.current = newScale;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  function doSearch() {
    const q = search.trim();
    if (!q) return;
    router.push(`/app?token=${encodeURIComponent(q)}`);
    loadToken(q);
  }

  function screenToWorld(sx: number, sy: number) {
    return { x: (sx - offsetRef.current.x) / scaleRef.current, y: (sy - offsetRef.current.y) / scaleRef.current };
  }

  function findBubbleAt(wx: number, wy: number): number {
    let found = -1;
    bubblesRef.current.forEach((b, i) => {
      const dx = (b.x||0) - wx, dy = (b.y||0) - wy;
      if (Math.sqrt(dx*dx+dy*dy) < (b.radius||10)) found = i;
    });
    return found;
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    isDraggingRef.current = true; hasDraggedRef.current = false;
    dragStartRef.current = { x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y };
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isDraggingRef.current) {
      const dx = Math.abs(e.clientX - dragStartRef.current.x - offsetRef.current.x);
      const dy = Math.abs(e.clientY - dragStartRef.current.y - offsetRef.current.y);
      if (dx > 3 || dy > 3) hasDraggedRef.current = true;
      offsetRef.current = { x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y };
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { x: wx, y: wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const found = findBubbleAt(wx, wy);
    hoveredRef.current = found;
    setHovered(found >= 0 ? bubblesRef.current[found] : null);
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    isDraggingRef.current = false;
    if (!hasDraggedRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { x: wx, y: wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const found = findBubbleAt(wx, wy);
      if (found >= 0) {
        selectedRef.current = found;
        setSelected(bubblesRef.current[found]);
        setSelectedPos({ x: e.clientX, y: e.clientY });
      } else {
        selectedRef.current = -1;
        setSelected(null);
      }
    }
  }

  function formatAmount(n: number): string {
    if (n >= 1e12) return (n/1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(2) + 'K';
    return n.toFixed(2);
  }

  function formatUSD(n: number): string {
    if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n/1e3).toFixed(2) + 'K';
    return '$' + n.toFixed(2);
  }

  const chainColors: Record<string, string> = { eth: '#627EEA', bsc: '#F3BA2F', sol: '#9945FF', base: '#0052FF' };
  const chainLabel: Record<string, string> = { eth: 'Ethereum', bsc: 'BSC', sol: 'Solana', base: 'Base' };

  return (
    <div style={{ height: '100vh', background: '#060400', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <nav style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid rgba(245,200,66,0.1)', height: 56, gap: 12, flexShrink: 0, background: 'rgba(10,8,0,0.95)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 18, textDecoration: 'none', color: '#f0ede6', flexShrink: 0 }}>
          <span>🍌</span><span>Banana<span style={{ color: '#F5C842' }}>Maps</span></span>
        </Link>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {(['eth','bsc','sol','base'] as const).map(c => (
            <button key={c} onClick={() => setChain(c)} style={{ background: chain===c?'rgba(245,200,66,0.1)':'transparent', border:`1px solid ${chain===c?chainColors[c]:'rgba(255,255,255,0.1)'}`, color:chain===c?chainColors[c]:'rgba(255,255,255,0.4)', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
              <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:chainColors[c], marginRight:5 }} />{c.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ flex:1, display:'flex', alignItems:'center', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(245,200,66,0.15)', borderRadius:8, padding:'0 12px', gap:8 }}>
          <span style={{ color:'rgba(255,255,255,0.3)', fontSize:14 }}>⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSearch()} placeholder="Token address or name..." style={{ flex:1, background:'none', border:'none', outline:'none', color:'#f0ede6', fontSize:13, padding:'10px 0' }} />
          <button onClick={doSearch} style={{ background:'#F5C842', color:'#000', border:'none', borderRadius:6, padding:'6px 14px', fontWeight:700, fontSize:13, cursor:'pointer' }}>{loading?'...':'Analyze'}</button>
        </div>
      </nav>

      <div style={{ flex:1, display:'flex', overflow:'hidden', position:'relative' }}>
        <div style={{ flex:1, position:'relative' }}>
          <canvas ref={canvasRef}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            onMouseLeave={() => { isDraggingRef.current=false; hoveredRef.current=-1; setHovered(null); }}
            style={{ width:'100%', height:'100%', display:'block', cursor:hovered?'pointer':'grab' }}
          />

          {!loading && !tokenName && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, pointerEvents:'none' }}>
              <div style={{ fontSize:52 }}>🍌</div>
              <div style={{ fontSize:14, color:'rgba(245,200,66,0.6)', fontWeight:600 }}>Search a token to get started</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.2)' }}>Scroll to zoom · Drag to pan · Click bubble for details</div>
            </div>
          )}

          {loading && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, background:'rgba(6,4,0,0.9)' }}>
              <div style={{ fontSize:44, animation:'spin 1s linear infinite' }}>🍌</div>
              <div style={{ fontSize:13, color:'rgba(245,200,66,0.7)' }}>Mapping holders...</div>
            </div>
          )}

          {tokenName && (
            <div style={{ position:'absolute', top:14, left:14, display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ background:'rgba(0,0,0,0.7)', border:`1px solid ${chainColors[chain]}44`, borderRadius:20, padding:'5px 12px', fontSize:11, color:chainColors[chain], display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:chainColors[chain], display:'inline-block' }} />{chainLabel[chain]}
                </div>
                <div style={{ background:'rgba(0,0,0,0.7)', border:'1px solid rgba(245,200,66,0.3)', borderRadius:20, padding:'5px 14px', fontSize:12, color:'#F5C842', fontWeight:600 }}>{tokenName}{tokenSymbol ? ` (${tokenSymbol})` : ''}</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {[['Mapped',stats.mapped],['Top 10%',stats.top10+'%'],['Clusters',stats.clusters]].map(([label,val]) => (
                  <div key={label as string} style={{ background:'rgba(0,0,0,0.6)', border:'1px solid rgba(245,200,66,0.1)', borderRadius:8, padding:'6px 12px' }}>
                    <div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:2 }}>{label}</div>
                    <div style={{ fontSize:14, color:'#F5C842', fontWeight:700 }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.clusters > 0 && (
            <div style={{ position:'absolute', bottom:16, left:16, display:'flex', gap:6, flexWrap:'wrap', maxWidth:500 }}>
              {Array.from({length:Math.min(stats.clusters,8)},(_,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(0,0,0,0.7)', border:`1px solid ${CLUSTER_COLORS[i]}44`, borderRadius:12, padding:'3px 10px', fontSize:10, color:CLUSTER_COLORS[i] }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:CLUSTER_COLORS[i], display:'inline-block' }} />Cluster {i+1}
                </div>
              ))}
            </div>
          )}

          {tokenName && (
            <div style={{ position:'absolute', bottom:16, right:16, display:'flex', flexDirection:'column', gap:4 }}>
              {[['＋',1.2],['－',0.8],['⊙',0]].map(([label,factor]) => (
                <button key={label as string} onClick={() => {
                  if(factor===0){scaleRef.current=1;offsetRef.current={x:0,y:0};}
                  else scaleRef.current=Math.min(Math.max(scaleRef.current*(factor as number),0.15),6);
                }} style={{ width:32, height:32, background:'rgba(0,0,0,0.7)', border:'1px solid rgba(245,200,66,0.2)', borderRadius:6, color:'rgba(245,200,66,0.6)', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Click popup with USD value + amount */}
          {selected && (
            <div style={{ position:'fixed', top:Math.min(selectedPos.y-10,window.innerHeight-260), left:Math.min(selectedPos.x+20,window.innerWidth-270), background:'rgba(10,8,0,0.97)', border:`1px solid ${selected.cluster!==undefined?CLUSTER_COLORS[selected.cluster%CLUSTER_COLORS.length]+'66':'rgba(245,200,66,0.3)'}`, borderRadius:12, padding:'14px 16px', width:255, zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,0.6)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:selected.cluster!==undefined?CLUSTER_COLORS[selected.cluster%CLUSTER_COLORS.length]:'#F5C842' }} />
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)', fontFamily:'DM Mono, monospace' }}>#{selected.rank}</span>
                </div>
                <button onClick={() => {setSelected(null);selectedRef.current=-1;}} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
              </div>

              <div style={{ fontFamily:'DM Mono, monospace', fontSize:11, color:'#F5C842', marginBottom:14, wordBreak:'break-all' }}>
                {selected.address.slice(0,10)}...{selected.address.slice(-8)}
              </div>

              {/* Stats row */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
                <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'8px 10px' }}>
                  <div style={{ fontSize:8, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>Of Supply</div>
                  <div style={{ fontSize:14, color:'#fff', fontWeight:700 }}>{selected.pct.toFixed(2)}%</div>
                </div>
                <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'8px 10px' }}>
                  <div style={{ fontSize:8, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>Amount</div>
                  <div style={{ fontSize:14, color:'#fff', fontWeight:700 }}>{selected.balanceFormatted ? formatAmount(selected.balanceFormatted) : '—'}</div>
                </div>
                <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'8px 10px' }}>
                  <div style={{ fontSize:8, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>USD Value</div>
                  <div style={{ fontSize:14, color:'#2EE89A', fontWeight:700 }}>{selected.usdValue ? formatUSD(selected.usdValue) : '—'}</div>
                </div>
              </div>

              {selected.cluster !== undefined && (
                <div style={{ marginBottom:12, padding:'6px 10px', background:`${CLUSTER_COLORS[selected.cluster%CLUSTER_COLORS.length]}15`, border:`1px solid ${CLUSTER_COLORS[selected.cluster%CLUSTER_COLORS.length]}33`, borderRadius:6, fontSize:11, color:CLUSTER_COLORS[selected.cluster%CLUSTER_COLORS.length] }}>
                  ● Cluster #{selected.cluster+1}
                </div>
              )}

              <button onClick={() => window.open(`https://etherscan.io/address/${selected.address}`,'_blank')} style={{ width:'100%', background:'rgba(245,200,66,0.08)', border:'1px solid rgba(245,200,66,0.2)', borderRadius:6, padding:'7px', color:'#F5C842', fontSize:11, cursor:'pointer', fontWeight:600 }}>
                View on Explorer ↗
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width:280, borderLeft:'1px solid rgba(245,200,66,0.08)', background:'rgba(8,6,0,0.95)', display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(245,200,66,0.08)', fontSize:9, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(245,200,66,0.4)' }}>Holders</div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {bubblesRef.current.length===0 ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, height:'100%', color:'rgba(255,255,255,0.2)' }}>
                <div style={{ fontSize:32 }}>🍌</div>
                <div style={{ fontSize:12 }}>Select a token</div>
              </div>
            ) : (
              bubblesRef.current.map((h,i) => (
                <div key={h.address}
                  onClick={() => {selectedRef.current=i;setSelected(h);}}
                  onMouseEnter={() => {hoveredRef.current=i;setHovered(h);}}
                  onMouseLeave={() => {hoveredRef.current=-1;setHovered(null);}}
                  style={{ padding:'9px 16px', borderBottom:'1px solid rgba(245,200,66,0.05)', display:'flex', alignItems:'center', gap:10, cursor:'pointer', background:selectedRef.current===i?'rgba(245,200,66,0.05)':'transparent' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:h.cluster!==undefined?CLUSTER_COLORS[h.cluster%CLUSTER_COLORS.length]+'22':'rgba(245,200,66,0.1)', border:`1.5px solid ${h.cluster!==undefined?CLUSTER_COLORS[h.cluster%CLUSTER_COLORS.length]:'rgba(245,200,66,0.35)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:h.cluster!==undefined?CLUSTER_COLORS[h.cluster%CLUSTER_COLORS.length]:'#F5C842', flexShrink:0 }}>{h.rank}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'DM Mono, monospace' }}>{h.address.slice(0,8)}...{h.address.slice(-6)}</div>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:1, display:'flex', gap:6 }}>
                      <span>{h.pct.toFixed(3)}%</span>
                      {h.usdValue ? <span style={{ color:'rgba(46,232,154,0.6)' }}>{formatUSD(h.usdValue)}</span> : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function formatUSD(n: number): string {
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n/1e3).toFixed(2) + 'K';
  return '$' + n.toFixed(2);
}

export default function AppPage() {
  return <Suspense><AppContent /></Suspense>;
}
