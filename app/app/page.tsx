'use client';
import { useEffect, useRef, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Holder, initBubbles, detectClusters, applyForces, drawBubbles, CLUSTER_COLORS } from '@/lib/bubbleEngine';
import { calculateRugScore, RugScoreResult } from '@/lib/rugScore';
import { getExchangeInfo } from '@/lib/exchanges';
import { supabase } from '@/lib/supabase';

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
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenLogo, setTokenLogo] = useState('');
  const [stats, setStats] = useState({ mapped: 0, top10: 0, clusters: 0 });
  const [selected, setSelected] = useState<Holder | null>(null);
  const [rugScore, setRugScore] = useState<RugScoreResult | null>(null);
  const [showRugDetails, setShowRugDetails] = useState(false);
  const [selectedPos, setSelectedPos] = useState({ x: 0, y: 0 });
  const [showList, setShowList] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const worldSizeRef = useRef({ w: 1200, h: 800 });

  // Check auth state
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || null);
    });
    return () => { listener.subscription.unsubscribe(); };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUserEmail(null);
    setShowUserMenu(false);
    router.push('/');
  }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  function autoFit(bubbles: Holder[], canvasW: number, canvasH: number) {
    if (!bubbles.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    bubbles.forEach(b => {
      const r = b.radius || 10;
      minX = Math.min(minX, (b.x||0) - r);
      maxX = Math.max(maxX, (b.x||0) + r);
      minY = Math.min(minY, (b.y||0) - r);
      maxY = Math.max(maxY, (b.y||0) + r);
    });
    const contentW = maxX - minX + 40;
    const contentH = maxY - minY + 40;
    const scale = Math.min(canvasW / contentW, canvasH / contentH, 1);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    scaleRef.current = scale;
    offsetRef.current = {
      x: canvasW / 2 - cx * scale,
      y: canvasH / 2 - cy * scale,
    };
  }

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
    setLoading(true); setTokenName(''); setTokenSymbol('');
    setSelected(null); selectedRef.current = -1; setShowList(false);
    cancelAnimationFrame(animRef.current);
    try {
      const { KNOWN_TOKENS } = await import('@/lib/constants');
      const upper = input.toUpperCase().trim();
      const known = KNOWN_TOKENS[upper];
      const address = known?.address || input;
      const detectedChain = known?.chain || chain;
      const data = await fetch(`/api/holders?address=${encodeURIComponent(address)}&chain=${detectedChain}`).then(r => r.json());
      const holders = data.holders || [];
      if (!holders.length) { setLoading(false); return; }
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      worldSizeRef.current = { w, h };
      const clustered = detectClusters(initBubbles(holders, w, h));
      bubblesRef.current = clustered;
      autoFit(clustered, w, h);
      setChain(detectedChain);
      setTokenName(data.name || known?.name || input);
      setTokenLogo(data.logo || '');
      setTokenSymbol(data.symbol || '');
      const top10pct = holders.slice(0,10).reduce((s: number, h: Holder) => s + h.pct, 0);
      const clusterCount = new Set(clustered.map(b => b.cluster).filter(c => c !== undefined)).size;
      setStats({ mapped: holders.length, top10: Math.round(top10pct), clusters: clusterCount });
      setRugScore(calculateRugScore(clustered, clusterCount, detectedChain));
      const rs = calculateRugScore(clustered, clusterCount);
      setRugScore(rs);
      startAnimation();
    } catch {}
    setLoading(false);
  }, [chain, startAnimation]);

  useEffect(() => { const t = searchParams.get('token'); if (t) loadToken(t); }, []);

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
      const mx = e.clientX-rect.left, my = e.clientY-rect.top;
      const zf = e.deltaY > 0 ? 0.92 : 1.08;
      const ns = Math.min(Math.max(scaleRef.current*zf, 0.1), 6);
      offsetRef.current.x = mx-(mx-offsetRef.current.x)*(ns/scaleRef.current);
      offsetRef.current.y = my-(my-offsetRef.current.y)*(ns/scaleRef.current);
      scaleRef.current = ns;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lastDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX-e.touches[1].clientX, dy = e.touches[0].clientY-e.touches[1].clientY;
        lastDist = Math.sqrt(dx*dx+dy*dy);
      } else {
        hasDraggedRef.current = false;
        dragStartRef.current = { x: e.touches[0].clientX-offsetRef.current.x, y: e.touches[0].clientY-offsetRef.current.y };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX-e.touches[1].clientX, dy = e.touches[0].clientY-e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx+dy*dy);
        const cx2 = (e.touches[0].clientX+e.touches[1].clientX)/2, cy2 = (e.touches[0].clientY+e.touches[1].clientY)/2;
        const rect = canvas.getBoundingClientRect();
        const mx = cx2-rect.left, my = cy2-rect.top;
        const ns = Math.min(Math.max(scaleRef.current*(dist/lastDist),0.1),6);
        offsetRef.current.x = mx-(mx-offsetRef.current.x)*(ns/scaleRef.current);
        offsetRef.current.y = my-(my-offsetRef.current.y)*(ns/scaleRef.current);
        scaleRef.current = ns; lastDist = dist;
      } else {
        hasDraggedRef.current = true;
        offsetRef.current = { x: e.touches[0].clientX-dragStartRef.current.x, y: e.touches[0].clientY-dragStartRef.current.y };
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!hasDraggedRef.current && e.changedTouches.length === 1) {
        const rect = canvas.getBoundingClientRect();
        const wx = (e.changedTouches[0].clientX-rect.left-offsetRef.current.x)/scaleRef.current;
        const wy = (e.changedTouches[0].clientY-rect.top-offsetRef.current.y)/scaleRef.current;
        const found = findBubbleAt(wx, wy);
        if (found >= 0) {
          selectedRef.current = found;
          setSelected(bubblesRef.current[found]);
          setSelectedPos({ x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY });
        } else { selectedRef.current = -1; setSelected(null); }
      }
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  function doSearch() {
    const q = search.trim();
    if (!q) return;
    router.push(`/app?token=${encodeURIComponent(q)}`);
    loadToken(q);
  }

  function findBubbleAt(wx: number, wy: number): number {
    let found = -1;
    bubblesRef.current.forEach((b,i) => {
      const dx=(b.x||0)-wx, dy=(b.y||0)-wy;
      if (Math.sqrt(dx*dx+dy*dy) < (b.radius||10)) found = i;
    });
    return found;
  }

  function sw(sx: number, sy: number) {
    return { x: (sx-offsetRef.current.x)/scaleRef.current, y: (sy-offsetRef.current.y)/scaleRef.current };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    isDraggingRef.current = true; hasDraggedRef.current = false;
    dragStartRef.current = { x: e.clientX-offsetRef.current.x, y: e.clientY-offsetRef.current.y };
  }
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isDraggingRef.current) {
      const dx = Math.abs(e.clientX-dragStartRef.current.x-offsetRef.current.x);
      const dy = Math.abs(e.clientY-dragStartRef.current.y-offsetRef.current.y);
      if (dx > 3 || dy > 3) hasDraggedRef.current = true;
      offsetRef.current = { x: e.clientX-dragStartRef.current.x, y: e.clientY-dragStartRef.current.y };
      return;
    }
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { x: wx, y: wy } = sw(e.clientX-rect.left, e.clientY-rect.top);
    hoveredRef.current = findBubbleAt(wx, wy);
  }
  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    isDraggingRef.current = false;
    if (!hasDraggedRef.current) {
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { x: wx, y: wy } = sw(e.clientX-rect.left, e.clientY-rect.top);
      const found = findBubbleAt(wx, wy);
      if (found >= 0) {
        selectedRef.current = found;
        setSelected(bubblesRef.current[found]);
        setSelectedPos({ x: e.clientX, y: e.clientY });
      } else { selectedRef.current = -1; setSelected(null); }
    }
  }

  function fUSD(n: number): string {
    if(n>=1e9)return'$'+(n/1e9).toFixed(2)+'B';
    if(n>=1e6)return'$'+(n/1e6).toFixed(2)+'M';
    if(n>=1e3)return'$'+(n/1e3).toFixed(2)+'K';
    return'$'+n.toFixed(2);
  }
  function fAmt(n: number): string {
    if(n>=1e12)return(n/1e12).toFixed(2)+'T';
    if(n>=1e9)return(n/1e9).toFixed(2)+'B';
    if(n>=1e6)return(n/1e6).toFixed(2)+'M';
    if(n>=1e3)return(n/1e3).toFixed(2)+'K';
    return n.toFixed(2);
  }

  const CC: Record<string,string> = { eth:'#627EEA',bsc:'#F3BA2F',sol:'#9945FF',base:'#0052FF' };
  const CL: Record<string,string> = { eth:'Ethereum',bsc:'BSC',sol:'Solana',base:'Base' };

  function getPopupStyle(): React.CSSProperties {
    const W = 210, H = 165;
    const vw = typeof window!=='undefined'?window.innerWidth:800;
    const vh = typeof window!=='undefined'?window.innerHeight:600;
    let left = selectedPos.x+16, top = selectedPos.y-H/2;
    if(left+W>vw-10)left=selectedPos.x-W-16;
    if(top<60)top=60;
    if(top+H>vh-20)top=vh-H-20;
    return { position:'fixed',top,left,width:W,background:'rgba(15,12,0,0.97)',border:`1px solid ${selected?.cluster!==undefined?CLUSTER_COLORS[selected.cluster%CLUSTER_COLORS.length]+'66':'rgba(245,200,66,0.2)'}`,borderRadius:10,padding:'10px 12px',zIndex:200,boxShadow:'0 4px 20px rgba(0,0,0,0.8)' };
  }

  return (
    <div style={{ height:'100dvh',background:'#0a0800',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <nav style={{ display:'flex',alignItems:'center',padding:'14px 12px',borderBottom:'1px solid rgba(245,200,66,0.1)',gap:8,flexShrink:0,background:'#0a0800' }}>
        <a href="/" style={{ display:'flex',alignItems:'center',gap:6,fontWeight:800,fontSize:19,textDecoration:'none',color:'#f0ede6',flexShrink:0 }}>
          <span>🍌</span><span className="nav-hide-mobile">Banana<span style={{color:'#F5C842'}}>Maps</span></span>
        </a>
        {!isMobile&&(
          <div style={{ display:'flex',gap:4 }}>
            {(['eth','bsc','sol','base'] as const).map(c=>(
              <button key={c} onClick={()=>setChain(c)} style={{ background:chain===c?'rgba(245,200,66,0.08)':'transparent',border:`1px solid ${chain===c?CC[c]:'rgba(255,255,255,0.08)'}`,color:chain===c?CC[c]:'rgba(255,255,255,0.35)',borderRadius:6,padding:'4px 8px',fontSize:10,cursor:'pointer',fontFamily:'inherit' }}>
                <span style={{ display:'inline-block',width:5,height:5,borderRadius:'50%',background:CC[c],marginRight:4 }}/>{c.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <div style={{ flex:1,maxWidth:800,display:'flex',alignItems:'center',background:'rgba(245,200,66,0.04)',border:'1px solid rgba(245,200,66,0.12)',borderRadius:8,padding:'0 10px',gap:6 }}>
          {isMobile&&(
            <select value={chain} onChange={e=>setChain(e.target.value)} style={{ background:'transparent',border:'none',outline:'none',color:CC[chain],fontSize:11,cursor:'pointer' }}>
              {['eth','bsc','sol','base'].map(c=><option key={c} value={c} style={{background:'#0a0a18'}}>{c.toUpperCase()}</option>)}
            </select>
          )}
          <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSearch()} placeholder="Token name or address..." style={{ flex:1,background:'none',border:'none',outline:'none',color:'#f5f0e8',fontSize:13,padding:'10px 0',minWidth:0 }}/>
          <button onClick={doSearch} style={{ background:'#F5C842',color:'#000',border:'none',borderRadius:6,padding:'5px 8px',fontWeight:700,fontSize:11,cursor:'pointer',flexShrink:0 }}>{loading?'...':'Go'}</button>
        </div>

        {/* Auth section */}
        {userEmail ? (
          <div style={{ position:'relative',flexShrink:0 }}>
            <button onClick={()=>setShowUserMenu(!showUserMenu)} style={{
              background:'rgba(245,200,66,0.08)',border:'1px solid rgba(245,200,66,0.2)',borderRadius:8,padding:'6px 12px',
              color:'#F5C842',fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontWeight:600,
            }}>
              <span style={{ width:6,height:6,borderRadius:'50%',background:'#2EE89A',display:'inline-block' }}/>
              <span className="nav-hide-mobile">{userEmail.length > 18 ? userEmail.slice(0,16)+'...' : userEmail}</span>
              <span style={{ fontSize:8 }}>▼</span>
            </button>
            {showUserMenu && (
              <div style={{
                position:'absolute',top:'calc(100% + 6px)',right:0,background:'rgba(15,12,0,0.97)',
                border:'1px solid rgba(245,200,66,0.15)',borderRadius:10,padding:'6px',minWidth:220,
                boxShadow:'0 8px 30px rgba(0,0,0,0.6)',zIndex:500,
              }}>
                <div style={{ padding:'8px 12px',fontSize:10,color:'rgba(245,200,66,0.4)',borderBottom:'1px solid rgba(245,200,66,0.08)',marginBottom:4,wordBreak:'break-all' }}>
                  {userEmail}
                </div>
                <button onClick={handleLogout} style={{
                  width:'100%',background:'none',border:'none',padding:'8px 12px',color:'#f5f0e8',fontSize:12,
                  cursor:'pointer',textAlign:'left',borderRadius:6,fontWeight:500,
                }} onMouseEnter={e=>e.currentTarget.style.background='rgba(245,200,66,0.08)'}
                   onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display:'flex',gap:6,flexShrink:0 }}>
            <button onClick={()=>router.push('/login')} style={{
              background:'none',border:'1px solid rgba(245,200,66,0.2)',borderRadius:7,padding:'6px 14px',
              color:'#f5f0e8',fontSize:11,cursor:'pointer',fontWeight:600,
            }}>Log in</button>
            <button onClick={()=>router.push('/signup')} className="nav-hide-mobile" style={{
              background:'#F5C842',border:'none',borderRadius:7,padding:'6px 14px',
              color:'#000',fontSize:11,cursor:'pointer',fontWeight:700,
            }}>Sign up</button>
          </div>
        )}

        {tokenName&&isMobile&&(
          <button onClick={()=>setShowList(true)} style={{ background:'rgba(245,200,66,0.08)',border:'1px solid rgba(100,120,200,0.2)',borderRadius:6,padding:'6px 8px',color:'rgba(245,200,66,0.8)',fontSize:10,cursor:'pointer',flexShrink:0 }}>☰</button>
        )}
      </nav>

      <div style={{ flex:1,display:'flex',overflow:'hidden',position:'relative' }}>
        <div style={{ flex:1,position:'relative',background:'#0a0800' }}>
          <canvas ref={canvasRef}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            onMouseLeave={()=>{isDraggingRef.current=false;hoveredRef.current=-1;}}
            style={{ width:'100%',height:'100%',display:'block',cursor:'grab',touchAction:'none' }}
          />
          {!loading&&!tokenName&&(
            <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,pointerEvents:'none' }}>
              <div style={{ fontSize:48 }}>🍌</div>
              <div style={{ fontSize:14,color:'rgba(245,200,66,0.6)',fontWeight:600,textAlign:'center',padding:'0 20px' }}>Search a token to get started</div>
              <div style={{ fontSize:11,color:'rgba(180,180,255,0.2)',textAlign:'center' }}>{isMobile?'Pinch to zoom · Drag to pan':'Scroll to zoom · Drag to pan · Click bubble for details'}</div>
            </div>
          )}
          {loading&&(
            <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,background:'rgba(10,8,0,0.9)' }}>
              <div style={{ fontSize:44,animation:'spin 1s linear infinite' }}>🍌</div>
              <div style={{ fontSize:13,color:'rgba(245,200,66,0.7)' }}>Mapping holders...</div>
            </div>
          )}
          {tokenName&&(
            <div style={{ position:'absolute',top:10,left:10,display:'flex',flexDirection:'column',gap:6 }}>
              <div style={{ display:'flex',gap:6 }}>
                <div style={{ background:'rgba(0,0,0,0.75)',border:`1px solid ${CC[chain]}44`,borderRadius:16,padding:'4px 10px',fontSize:10,color:CC[chain],display:'flex',alignItems:'center',gap:5 }}>
                  <span style={{ width:6,height:6,borderRadius:'50%',background:CC[chain],display:'inline-block' }}/>{CL[chain]}
                </div>
                <div style={{ background:'rgba(0,0,0,0.75)',border:'1px solid rgba(245,200,66,0.25)',borderRadius:16,padding:'4px 12px',fontSize:11,color:'#F5C842',fontWeight:600,display:'flex',alignItems:'center',gap:6 }}>{tokenLogo&&<img src={tokenLogo} style={{width:16,height:16,borderRadius:'50%'}} onError={e=>(e.currentTarget.style.display='none')}/>}{tokenName}{tokenSymbol?` (${tokenSymbol})`:''}</div>
              </div>
              <div style={{ display:'flex',gap:5,flexWrap:'wrap' }}>
                {[['Mapped',stats.mapped],['Top 10',stats.top10+'%'],['Clusters',stats.clusters]].map(([l,v])=>(
                  <div key={l as string} style={{ background:'rgba(0,0,0,0.65)',border:'1px solid rgba(100,120,200,0.12)',borderRadius:6,padding:'4px 8px' }}>
                    <div style={{ fontSize:8,color:'rgba(245,200,66,0.35)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:1 }}>{l}</div>
                    <div style={{ fontSize:12,color:'rgba(220,220,255,0.9)',fontWeight:700 }}>{v}</div>
                  </div>
                ))}
                {rugScore&&(
                  <div onClick={()=>setShowRugDetails(!showRugDetails)} style={{ background:'rgba(0,0,0,0.65)',border:`1px solid ${rugScore.color}44`,borderRadius:6,padding:'4px 8px',cursor:'pointer',position:'relative' }}>
                    <div style={{ fontSize:8,color:'rgba(245,200,66,0.35)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:1 }}>Risk Score</div>
                    <div style={{ display:'flex',alignItems:'center',gap:4 }}>
                      <span style={{ width:6,height:6,borderRadius:'50%',background:rugScore.color,display:'inline-block' }}/>
                      <span style={{ fontSize:12,color:rugScore.color,fontWeight:700 }}>{rugScore.score}</span>
                      <span style={{ fontSize:9,color:rugScore.color,opacity:0.7 }}>{rugScore.label}</span>
                    </div>
                  </div>
                )}
              </div>
              {rugScore&&showRugDetails&&(
                <div style={{ background:'rgba(0,0,0,0.85)',border:`1px solid ${rugScore.color}33`,borderRadius:10,padding:'12px',marginTop:6,maxWidth:320 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
                    <div style={{ fontSize:11,fontWeight:700,color:rugScore.color }}>Risk Analysis — {rugScore.score}/100</div>
                    <button onClick={()=>setShowRugDetails(false)} style={{ background:'none',border:'none',color:'rgba(255,255,255,0.3)',cursor:'pointer',fontSize:14,padding:0,lineHeight:1 }}>×</button>
                  </div>
                  {rugScore.factors.map(f=>(
                    <div key={f.name} style={{ marginBottom:8 }}>
                      <div style={{ display:'flex',justifyContent:'space-between',marginBottom:3 }}>
                        <span style={{ fontSize:9,color:'rgba(255,255,255,0.5)' }}>{f.name}</span>
                        <span style={{ fontSize:9,color:f.score>=70?'#2EE89A':f.score>=40?'#EAB308':'#EF4444',fontWeight:600 }}>{f.score}/100</span>
                      </div>
                      <div style={{ height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden' }}>
                        <div style={{ height:'100%',width:`${f.score}%`,background:f.score>=70?'#2EE89A':f.score>=40?'#EAB308':'#EF4444',borderRadius:2,transition:'width 0.5s' }}/>
                      </div>
                      <div style={{ fontSize:8,color:'rgba(255,255,255,0.25)',marginTop:2 }}>{f.detail}</div>
                    </div>
                  ))}
                  <div style={{ fontSize:7,color:'rgba(255,255,255,0.15)',marginTop:6,lineHeight:1.4 }}>This score is for informational purposes only and does not constitute financial advice. Always do your own research.</div>
                </div>
              )}
            </div>
          )}
          {!isMobile&&stats.clusters>0&&(
            <div style={{ position:'absolute',bottom:52,left:12,display:'flex',gap:5,flexWrap:'wrap',maxWidth:500 }}>
              {Array.from({length:Math.min(stats.clusters,8)},(_,i)=>(
                <div key={i} style={{ display:'flex',alignItems:'center',gap:4,background:'rgba(0,0,0,0.65)',border:`1px solid ${CLUSTER_COLORS[i]}44`,borderRadius:10,padding:'2px 8px',fontSize:9,color:CLUSTER_COLORS[i] }}>
                  <span style={{ width:5,height:5,borderRadius:'50%',background:CLUSTER_COLORS[i],display:'inline-block' }}/>Cluster {i+1}
                </div>
              ))}
            </div>
          )}
          {tokenName&&(
            <div style={{ position:'absolute',bottom:12,right:12,display:'flex',flexDirection:'column',gap:4 }}>
              {[['＋',1.2],['－',0.8],['⊙',0]].map(([l,f])=>(
                <button key={l as string} onClick={()=>{
                  if(f===0)autoFit(bubblesRef.current,canvasRef.current?.offsetWidth||800,canvasRef.current?.offsetHeight||600);
                  else scaleRef.current=Math.min(Math.max(scaleRef.current*(f as number),0.1),6);
                }} style={{ width:30,height:30,background:'rgba(0,0,0,0.7)',border:'1px solid rgba(100,120,200,0.2)',borderRadius:7,color:'rgba(245,200,66,0.5)',fontSize:15,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {selected&&(
            <div style={getPopupStyle()}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
                <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                  <div style={{ width:7,height:7,borderRadius:'50%',background:selected.cluster!==undefined?CLUSTER_COLORS[selected.cluster%CLUSTER_COLORS.length]:'rgba(160,170,220,0.9)' }}/>
                  <span style={{ fontSize:10,color:'rgba(180,180,220,0.5)',fontFamily:'DM Mono,monospace' }}>#{selected.rank}</span>
                  {selected.cluster!==undefined&&(
                    <span style={{ fontSize:9,color:CLUSTER_COLORS[selected.cluster%CLUSTER_COLORS.length],background:CLUSTER_COLORS[selected.cluster%CLUSTER_COLORS.length]+'15',padding:'1px 6px',borderRadius:8,border:`1px solid ${CLUSTER_COLORS[selected.cluster%CLUSTER_COLORS.length]}33` }}>C{selected.cluster+1}</span>
                  )}
                </div>
                <button onClick={()=>{setSelected(null);selectedRef.current=-1;}} style={{ background:'none',border:'none',color:'rgba(200,170,80,0.4)',cursor:'pointer',fontSize:16,lineHeight:1,padding:0 }}>×</button>
              </div>
              <div style={{ fontFamily:'DM Mono,monospace',fontSize:9,color:'rgba(245,200,66,0.6)',marginBottom:8,wordBreak:'break-all' }}>{selected.address.slice(0,10)}...{selected.address.slice(-8)}</div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5,marginBottom:8 }}>
                {[['Supply',selected.pct.toFixed(2)+'%','rgba(220,220,255,0.9)'],['Amount',selected.balanceFormatted?fAmt(selected.balanceFormatted):'—','rgba(220,220,255,0.9)'],['USD',selected.usdValue?fUSD(selected.usdValue):'—','#2EE89A']].map(([l,v,c])=>(
                  <div key={l as string} style={{ background:'rgba(245,200,66,0.04)',borderRadius:6,padding:'5px 6px' }}>
                    <div style={{ fontSize:7,color:'rgba(200,170,80,0.4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:3 }}>{l}</div>
                    <div style={{ fontSize:12,color:c as string,fontWeight:700 }}>{v}</div>
                  </div>
                ))}
              </div>
              <button onClick={()=>window.open(`${chain==='sol'?'https://solscan.io/account':chain==='bsc'?'https://bscscan.com/address':chain==='base'?'https://basescan.org/address':'https://etherscan.io/address'}/${selected.address}`,'_blank')} style={{ width:'100%',background:'rgba(245,200,66,0.04)',border:'1px solid rgba(245,200,66,0.12)',borderRadius:6,padding:'5px',color:'rgba(245,200,66,0.5)',fontSize:10,cursor:'pointer',fontWeight:500 }}>
                View on Explorer ↗
              </button>
            </div>
          )}
        </div>

        {!isMobile&&(
          <div style={{ width:250,borderLeft:'1px solid rgba(245,200,66,0.08)',background:'#0a0800',display:'flex',flexDirection:'column',flexShrink:0 }}>
            <div style={{ padding:'10px 14px',borderBottom:'1px solid rgba(245,200,66,0.08)',fontSize:9,letterSpacing:'1.5px',textTransform:'uppercase',color:'rgba(245,200,66,0.35)' }}>Holders</div>
            <div style={{ flex:1,overflowY:'auto' }}>
              {bubblesRef.current.length===0?(
                <div style={{ display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8,height:'100%',color:'rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize:28 }}>🍌</div><div style={{ fontSize:11 }}>Select a token</div>
                </div>
              ):bubblesRef.current.map((h,i)=>(
                <div key={h.address} onClick={()=>{selectedRef.current=i;setSelected(h);}} onMouseEnter={()=>{hoveredRef.current=i;}} onMouseLeave={()=>{hoveredRef.current=-1;}}
                  style={{ padding:'8px 14px',borderBottom:'1px solid rgba(245,200,66,0.05)',display:'flex',alignItems:'center',gap:8,cursor:'pointer',background:selectedRef.current===i?'rgba(245,200,66,0.04)':'transparent' }}>
                  <div style={{ width:20,height:20,borderRadius:'50%',background:h.cluster!==undefined?CLUSTER_COLORS[h.cluster%CLUSTER_COLORS.length]+'15':'rgba(245,200,66,0.06)',border:`1.5px solid ${h.cluster!==undefined?CLUSTER_COLORS[h.cluster%CLUSTER_COLORS.length]:'rgba(245,200,66,0.25)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:h.cluster!==undefined?CLUSTER_COLORS[h.cluster%CLUSTER_COLORS.length]:'rgba(150,160,200,0.6)',flexShrink:0 }}>{h.rank}</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:10,color:'rgba(245,235,200,0.7)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:'DM Mono,monospace' }}>{(() => { const ex = getExchangeInfo(h.address, chain); return ex ? ex.name : `${h.address.slice(0,8)}...${h.address.slice(-6)}`; })()}</div>
                    <div style={{ fontSize:9,color:'rgba(200,180,100,0.3)',marginTop:1,display:'flex',gap:6 }}>
                      {getExchangeInfo(h.address, chain) && <span style={{ color:'#627EEA',fontSize:8,background:'rgba(98,126,234,0.1)',padding:'0 4px',borderRadius:3 }}>Exchange</span>}
                      <span>{h.pct.toFixed(3)}%</span>
                      {h.usdValue?<span style={{color:'rgba(46,232,154,0.4)'}}>{fUSD(h.usdValue)}</span>:null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isMobile&&showList&&(
          <div style={{ position:'fixed',inset:0,zIndex:300,display:'flex',flexDirection:'column' }}>
            <div style={{ flex:1,background:'rgba(0,0,0,0.5)' }} onClick={()=>setShowList(false)}/>
            <div style={{ background:'rgba(12,10,0,0.99)',borderRadius:'18px 18px 0 0',borderTop:'1px solid rgba(245,200,66,0.12)',maxHeight:'70vh',display:'flex',flexDirection:'column' }}>
              <div style={{ padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid rgba(245,200,66,0.06)' }}>
                <span style={{ fontSize:10,letterSpacing:'1.5px',textTransform:'uppercase',color:'rgba(245,200,66,0.35)' }}>Holders</span>
                <button onClick={()=>setShowList(false)} style={{ background:'rgba(255,255,255,0.05)',border:'none',borderRadius:'50%',width:26,height:26,color:'rgba(255,255,255,0.3)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
              </div>
              <div style={{ overflowY:'auto',flex:1 }}>
                {bubblesRef.current.map((h,i)=>(
                  <div key={h.address} onClick={()=>{selectedRef.current=i;setSelected(h);setShowList(false);setSelectedPos({x:window.innerWidth/2,y:window.innerHeight/2});}}
                    style={{ padding:'10px 16px',borderBottom:'1px solid rgba(245,200,66,0.05)',display:'flex',alignItems:'center',gap:10 }}>
                    <div style={{ width:22,height:22,borderRadius:'50%',background:h.cluster!==undefined?CLUSTER_COLORS[h.cluster%CLUSTER_COLORS.length]+'15':'rgba(245,200,66,0.06)',border:`1.5px solid ${h.cluster!==undefined?CLUSTER_COLORS[h.cluster%CLUSTER_COLORS.length]:'rgba(245,200,66,0.25)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:h.cluster!==undefined?CLUSTER_COLORS[h.cluster%CLUSTER_COLORS.length]:'rgba(150,160,200,0.6)',flexShrink:0 }}>{h.rank}</div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:11,color:'rgba(245,235,200,0.7)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:'DM Mono,monospace' }}>{h.address.slice(0,10)}...{h.address.slice(-6)}</div>
                      <div style={{ fontSize:10,color:'rgba(200,180,100,0.3)',marginTop:2,display:'flex',gap:8 }}>
                        <span>{h.pct.toFixed(3)}%</span>
                        {h.usdValue?<span style={{color:'rgba(46,232,154,0.4)'}}>{fUSD(h.usdValue)}</span>:null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function AppPage() {
  return <Suspense><AppContent /></Suspense>;
}
