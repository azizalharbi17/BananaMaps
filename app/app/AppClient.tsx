'use client';
import { useEffect, useRef, useState, Suspense, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TokenGraph } from '@/lib/graphTypes';
import { buildSim, drawGraph, findNodeAt, GraphSim, clusterColor } from '@/lib/mapEngine';
import { calculateRugScore, RugScoreResult } from '@/lib/rugScore';
import { supabase } from '@/lib/supabase';
import AddressList, { EXPLORER } from './AddressList';

const CC: Record<string, string> = { eth: '#627EEA', bsc: '#F3BA2F', sol: '#9945FF', base: '#0052FF', robinhood: '#00C805' };
const CL: Record<string, string> = { eth: 'Ethereum', bsc: 'BSC', sol: 'Solana', base: 'Base', robinhood: 'Robinhood' };

function fmtPrice(p: number): string {
  if (!p) return '—';
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1) return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  // Memecoin territory: keep 3 significant digits without exponential notation
  const s = p.toFixed(20);
  const m = s.match(/^0\.(0*)([1-9]\d{0,2})/);
  return m ? `$0.${m[1]}${m[2]}` : '$' + p.toPrecision(3);
}

// Non-blocking first-build polling (embed mode): probe cadence, one re-kick in
// case the background build died server-side, and a hard stop so the state never
// spins forever. The re-kick waits out the server's 300s maxDuration — a build
// still missing past that is definitively dead, so re-kicking can't duplicate a
// live one — and the give-up leaves the re-kicked build time to finish.
const BUILD_POLL_MS = 20_000;
const BUILD_REKICK_MS = 330_000;
const BUILD_GIVE_UP_MS = 510_000;

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fUSD(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
  return '$' + n.toFixed(2);
}
function fAmt(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}

interface DiscoverToken {
  chain: string;
  address: string;
  name: string;
  symbol: string;
  logo: string;
  change24h: number;
}

function TokenTile({ t, onOpen }: { t: DiscoverToken; onOpen: (addr: string, chain?: string) => void }) {
  return (
    <button onClick={() => onOpen(t.address, t.chain)} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', cursor: 'pointer', textAlign: 'left',
      background: 'rgba(245,200,66,0.04)', border: '1px solid rgba(245,200,66,0.1)', borderRadius: 10, minWidth: 0,
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,200,66,0.09)'; e.currentTarget.style.borderColor = 'rgba(245,200,66,0.3)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,200,66,0.04)'; e.currentTarget.style.borderColor = 'rgba(245,200,66,0.1)'; }}>
      {t.logo ? (
        <img src={t.logo} alt="" style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />
      ) : (
        <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'rgba(245,200,66,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#F5C842', fontWeight: 800 }}>{(t.symbol || '?')[0]}</span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f0ead8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.symbol || t.name}</span>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: CC[t.chain] || '#888', flexShrink: 0 }} />
        </span>
        <span style={{ display: 'block', fontSize: 9, color: 'rgba(245,235,200,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
      </span>
      {t.change24h !== 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0, color: t.change24h >= 0 ? '#2EE89A' : '#EF4444' }}>
          {t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(1)}%
        </span>
      )}
    </button>
  );
}

function AppContent({ embed = false }: { embed?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const simRef = useRef<GraphSim | null>(null);
  const graphRef = useRef<TokenGraph | null>(null);
  const hoveredIdxRef = useRef(-1);
  const selectedIdxRef = useRef(-1);
  const highlightRef = useRef<Set<string>>(new Set());
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const autoFitRef = useRef(false);
  const userTouchedViewRef = useRef(false);
  const sizeRef = useRef({ w: 800, h: 600 }); // canvas CSS-pixel size (backing store is DPR-scaled)
  const reqSeqRef = useRef(0);                // stale-response guard for loadToken
  const aliveRef = useRef(true);              // stops the embed poll loop after unmount
  const lastLoadedRef = useRef<string | null>(null);
  const pinchedRef = useRef(false);           // suppress tap-select after a pinch gesture

  const searchParams = useSearchParams();
  const router = useRouter();
  // Embed mode (/embed route, or ?embed=1): map-only chrome for iframing on
  // partner sites (e.g. BananaScreener) — no nav, compact sidebar drawer,
  // attribution link instead. Also switches first builds to non-blocking polling.
  const isEmbed = embed || searchParams.get('embed') === '1';
  const [search, setSearch] = useState(searchParams.get('token') || '');
  const [chain, setChain] = useState('eth');
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState<number | null>(null); // build start ts while the server computes
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<TokenGraph | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [ageTick, setAgeTick] = useState(0); // re-render for the age pill
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedAddr, setSelectedAddr] = useState<string | null>(null);
  const [selectedPos, setSelectedPos] = useState({ x: 0, y: 0 });
  const [query, setQuery] = useState('');
  const [ungroup, setUngroup] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rugScore, setRugScore] = useState<RugScoreResult | null>(null);
  const [showRugDetails, setShowRugDetails] = useState(false);
  const [showList, setShowList] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [shared, setShared] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [discover, setDiscover] = useState<{ popular: DiscoverToken[]; trending: DiscoverToken[] } | null>(null);

  // Discovery grid data for the empty state
  useEffect(() => {
    fetch('/api/trending')
      .then(r => r.json())
      .then(d => setDiscover({ popular: d.popular || [], trending: d.trending || [] }))
      .catch(() => {});
  }, []);

  function openDiscoverToken(addr: string, tokenChain?: string) {
    router.push(`/app?token=${encodeURIComponent(addr)}${tokenChain ? `&chain=${encodeURIComponent(tokenChain)}` : ''}`);
  }

  const addrToIdx = useMemo(() => {
    const m = new Map<string, number>();
    graph?.nodes.forEach((n, i) => m.set(n.address, i));
    return m;
  }, [graph]);

  // Keep refs in sync for the rAF loop
  useEffect(() => { graphRef.current = graph; }, [graph]);
  useEffect(() => {
    selectedIdxRef.current = selectedAddr !== null ? (addrToIdx.get(selectedAddr) ?? -1) : -1;
  }, [selectedAddr, addrToIdx]);
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q || !graph) { highlightRef.current = new Set(); return; }
    highlightRef.current = new Set(
      graph.nodes
        .filter(n => n.address.toLowerCase().includes(q) || (n.label || '').toLowerCase().includes(q))
        .map(n => n.address),
    );
  }, [query, graph]);

  // Auth state (unchanged behavior)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email || null)).catch(() => {});
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email || null);
    });
    return () => { listener.subscription.unsubscribe(); };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut().catch(() => {});
    setUserEmail(null); setShowUserMenu(false);
    router.push('/');
  }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Refresh the "Xm ago" pill once a minute
  useEffect(() => {
    const t = setInterval(() => setAgeTick(v => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Tick the elapsed readout on the building overlay once a second
  const [buildTick, setBuildTick] = useState(0);
  useEffect(() => {
    if (building === null) return;
    const t = setInterval(() => setBuildTick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, [building]);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  function syncCanvasSize(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    sizeRef.current = { w: canvas.offsetWidth, h: canvas.offsetHeight };
    canvas.width = Math.round(canvas.offsetWidth * dpr);
    canvas.height = Math.round(canvas.offsetHeight * dpr);
  }

  function autoFit() {
    const g = simRef.current;
    if (!g || !g.nodes.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of g.nodes) {
      minX = Math.min(minX, (n.x || 0) - n.radius);
      maxX = Math.max(maxX, (n.x || 0) + n.radius);
      minY = Math.min(minY, (n.y || 0) - n.radius);
      maxY = Math.max(maxY, (n.y || 0) + n.radius);
    }
    const { w: cw, h: ch } = sizeRef.current;
    const scale = Math.min(cw / (maxX - minX + 60), ch / (maxY - minY + 60), 1.4);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    scaleRef.current = scale;
    offsetRef.current = { x: cw / 2 - cx * scale, y: ch / 2 - cy * scale };
  }

  // Build / rebuild the simulation when graph or hidden set changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    hoveredIdxRef.current = -1; // node indices are only valid within one graph
    if (!graph || !canvas) { simRef.current = null; return; }
    syncCanvasSize(canvas);
    const prev = simRef.current;
    const g = buildSim(graph, hidden, sizeRef.current.w, sizeRef.current.h);
    // Preserve positions across rebuilds (eye toggles shouldn't rescatter the map)
    if (prev && prev.nodes.length) {
      const pos = new Map(prev.nodes.map(n => [n.node.address, n]));
      let preserved = 0;
      for (const n of g.nodes) {
        const p = pos.get(n.node.address);
        if (p) { n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0; preserved++; }
      }
      if (preserved > 0) g.sim.alpha(0.3);
    } else {
      autoFitRef.current = true;
      userTouchedViewRef.current = false;
    }
    simRef.current = g;
    if (process.env.NODE_ENV === 'development') (window as any).__simDebug = { sim: g, size: { ...sizeRef.current } };
  }, [graph, hidden]);

  // Single render loop: tick the sim while hot, always draw. Driven by rAF with a
  // timer backup — browsers suspend rAF entirely in hidden/embedded tabs, and the
  // sim should still settle there.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const loop = () => {
      if (stopped) return;
      cancelAnimationFrame(animRef.current);
      clearTimeout(timer);
      const dpr = window.devicePixelRatio || 1;
      const { w, h } = sizeRef.current;
      // All drawing happens in CSS pixels; the DPR transform keeps output crisp.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
      bg.addColorStop(0, '#0d0a00'); bg.addColorStop(1, '#0a0800');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        ctx.beginPath();
        ctx.arc((Math.sin(i * 137.508) * 0.5 + 0.5) * w, (Math.cos(i * 97.311) * 0.5 + 0.5) * h, 0.4 + (i % 3) * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245,200,66,${0.015 + (i % 5) * 0.008})`; ctx.fill();
      }
      const g = simRef.current;
      if (g) {
        if (g.sim.alpha() > g.sim.alphaMin()) {
          g.sim.tick(); g.sim.tick();
          if (autoFitRef.current && !userTouchedViewRef.current) autoFit();
        } else if (autoFitRef.current) {
          if (!userTouchedViewRef.current) autoFit();
          autoFitRef.current = false;
        }
        ctx.save();
        ctx.translate(offsetRef.current.x, offsetRef.current.y);
        ctx.scale(scaleRef.current, scaleRef.current);
        drawGraph(ctx, g, {
          hoveredIdx: hoveredIdxRef.current,
          selectedIdx: selectedIdxRef.current,
          highlight: highlightRef.current,
          scale: scaleRef.current,
        });
        ctx.restore();
      }
      animRef.current = requestAnimationFrame(loop);
      timer = setTimeout(loop, 66); // backup cadence when rAF is suspended
    };
    animRef.current = requestAnimationFrame(loop);
    timer = setTimeout(loop, 66);
    return () => { stopped = true; cancelAnimationFrame(animRef.current); clearTimeout(timer); };
  }, []);

  const loadToken = useCallback(async (input: string, opts?: { refresh?: boolean; chainOverride?: string }) => {
    if (!input.trim()) return;
    const myReq = ++reqSeqRef.current; // ignore this response if a newer request starts
    lastLoadedRef.current = input.trim();
    setError(null);
    setBuilding(null);
    if (opts?.refresh) setRefreshing(true);
    else {
      setLoading(true);
      setSelectedAddr(null);
      setShowList(false);
    }
    try {
      const baseParams = () => new URLSearchParams({ token: input.trim(), chain: opts?.chainOverride || chain });
      const params = baseParams();
      if (opts?.refresh) params.set('refresh', '1');
      // An iframe visitor can't sit on a 1-3 min build request — ask the API to
      // build in the background (202) and poll until the snapshot lands.
      else if (isEmbed) params.set('wait', '0');
      let res = await fetch(`/api/graph?${params}`);
      let data = await res.json();
      if (reqSeqRef.current !== myReq) return;
      if (res.status === 202 && data.building) {
        setLoading(false);
        const started = Date.now();
        setBuilding(started);
        let rekicked = false;
        let misses = 0;
        let errStreak = 0;
        while (true) {
          await new Promise(r => setTimeout(r, BUILD_POLL_MS));
          if (!aliveRef.current || reqSeqRef.current !== myReq) return;
          if (Date.now() - started > BUILD_GIVE_UP_MS) {
            setError('This map is taking longer than usual to build — try again in a minute.');
            return;
          }
          const p = baseParams();
          // One re-kick after the server's build ceiling in case the original died.
          const rekicking = !rekicked && Date.now() - started > BUILD_REKICK_MS;
          if (rekicking) p.set('wait', '0');
          else p.set('poll', '1');
          try {
            res = await fetch(`/api/graph?${p}`);
            data = await res.json();
            misses = 0;
            if (rekicking) rekicked = true; // only consumed once it actually reached the server
          } catch {
            if (++misses >= 3) throw new Error('poll failed');
            continue; // transient network blip — keep polling
          }
          if (!aliveRef.current || reqSeqRef.current !== myReq) return;
          if (res.ok && data.graph) break;
          if (res.status === 202) { errStreak = 0; continue; }
          // Error responses can be transient too (an upstream blip can 502 one
          // probe) — only give up when they persist.
          if (++errStreak >= 3) {
            setError(data.error || 'Failed to load token');
            return;
          }
        }
      }
      if (!res.ok || !data.graph) {
        setError(data.error || 'Failed to load token');
        return;
      }
      const g: TokenGraph = data.graph;
      const sameToken = graphRef.current && graphRef.current.chain === g.chain && graphRef.current.address === g.address;
      setGraph(g);
      setCachedAt(data.cachedAt || g.computedAt);
      setChain(g.chain);
      if (!opts?.refresh || !sameToken) {
        // CEX / DEX / burn / contract wallets start hidden (BubbleMaps default)
        setHidden(new Set(g.nodes.filter(n => n.labelType).map(n => n.address)));
        setExpanded(new Set());
        setQuery('');
        setUngroup(false);
        simRef.current = null; // force fresh layout
      }
      const holders = g.nodes.filter(n => n.kind === 'holder');
      // Rug-score inputs: only exchange-like labels exclude a wallet from concentration
      // math (contracts like vesting wallets are real holders), and only clusters with
      // ≥2 top holders count as suspicious (holder+counterparty pairs are routine).
      const meaningfulClusters = g.clusters.filter(c =>
        c.members.filter(i => g.nodes[i].kind === 'holder').length >= 2).length;
      setRugScore(calculateRugScore(
        holders.map(h => ({ pct: h.pct, cluster: h.cluster, address: h.address, isLabeledExchange: !!h.labelType && h.labelType !== 'contract' })),
        meaningfulClusters,
        g.chain,
      ));
    } catch {
      if (reqSeqRef.current === myReq) setError('Failed to load token');
    } finally {
      if (reqSeqRef.current === myReq) {
        setLoading(false);
        setRefreshing(false);
        setBuilding(null);
      }
    }
  }, [chain, isEmbed]);

  // URL-driven loading: covers first mount, in-app searches (router.push), and
  // browser back/forward — the URL is the source of truth for which token shows.
  const urlToken = searchParams.get('token');
  const urlChain = searchParams.get('chain');
  const [embedListOpen, setEmbedListOpen] = useState(false);
  useEffect(() => {
    if (urlToken && urlToken !== lastLoadedRef.current) {
      setSearch(urlToken);
      loadToken(urlToken, urlChain ? { chainOverride: urlChain } : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => syncCanvasSize(canvas));
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userTouchedViewRef.current = true;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const zf = e.deltaY > 0 ? 0.92 : 1.08;
      const ns = Math.min(Math.max(scaleRef.current * zf, 0.05), 8);
      offsetRef.current.x = mx - (mx - offsetRef.current.x) * (ns / scaleRef.current);
      offsetRef.current.y = my - (my - offsetRef.current.y) * (ns / scaleRef.current);
      scaleRef.current = ns;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Touch pan + pinch zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lastDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      userTouchedViewRef.current = true;
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
        lastDist = Math.sqrt(dx * dx + dy * dy);
        pinchedRef.current = true; // a pinch gesture must never end in a tap-select
      } else {
        hasDraggedRef.current = false;
        pinchedRef.current = false;
        dragStartRef.current = { x: e.touches[0].clientX - offsetRef.current.x, y: e.touches[0].clientY - offsetRef.current.y };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const cx2 = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy2 = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = canvas.getBoundingClientRect();
        const mx = cx2 - rect.left, my = cy2 - rect.top;
        const ns = Math.min(Math.max(scaleRef.current * (dist / lastDist), 0.05), 8);
        offsetRef.current.x = mx - (mx - offsetRef.current.x) * (ns / scaleRef.current);
        offsetRef.current.y = my - (my - offsetRef.current.y) * (ns / scaleRef.current);
        scaleRef.current = ns; lastDist = dist;
        hasDraggedRef.current = true;
      } else {
        hasDraggedRef.current = true;
        offsetRef.current = { x: e.touches[0].clientX - dragStartRef.current.x, y: e.touches[0].clientY - dragStartRef.current.y };
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // Pinch → single-finger transition: re-base the drag origin on the post-zoom
        // offset so the remaining finger pans smoothly instead of teleporting the map.
        dragStartRef.current = { x: e.touches[0].clientX - offsetRef.current.x, y: e.touches[0].clientY - offsetRef.current.y };
      }
      if (!hasDraggedRef.current && !pinchedRef.current && e.touches.length === 0 && e.changedTouches.length === 1) {
        const rect = canvas.getBoundingClientRect();
        const wx = (e.changedTouches[0].clientX - rect.left - offsetRef.current.x) / scaleRef.current;
        const wy = (e.changedTouches[0].clientY - rect.top - offsetRef.current.y) / scaleRef.current;
        selectAtPoint(wx, wy, e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
      if (e.touches.length === 0) pinchedRef.current = false;
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectAtPoint(wx: number, wy: number, screenX: number, screenY: number) {
    const g = simRef.current, graph = graphRef.current;
    if (!g || !graph) return;
    const idx = findNodeAt(g, wx, wy, scaleRef.current);
    if (idx >= 0) {
      const node = graph.nodes[idx];
      setSelectedAddr(node.address);
      setSelectedPos({ x: screenX, y: screenY });
      // Sync sidebar: expand the node's cluster row, then scroll its row into view
      if (node.cluster !== undefined) setExpanded(prev => new Set(prev).add(node.cluster!));
      setTimeout(() => {
        document.querySelector(`[data-addr-row="${CSS.escape(node.address)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 50);
    } else {
      setSelectedAddr(null);
    }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    isDraggingRef.current = true; hasDraggedRef.current = false;
    dragStartRef.current = { x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y };
  }
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isDraggingRef.current) {
      const dx = Math.abs(e.clientX - dragStartRef.current.x - offsetRef.current.x);
      const dy = Math.abs(e.clientY - dragStartRef.current.y - offsetRef.current.y);
      if (dx > 3 || dy > 3) { hasDraggedRef.current = true; userTouchedViewRef.current = true; }
      offsetRef.current = { x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y };
      return;
    }
    const canvas = canvasRef.current, g = simRef.current;
    if (!canvas || !g) return;
    const rect = canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left - offsetRef.current.x) / scaleRef.current;
    const wy = (e.clientY - rect.top - offsetRef.current.y) / scaleRef.current;
    hoveredIdxRef.current = findNodeAt(g, wx, wy, scaleRef.current);
    canvas.style.cursor = hoveredIdxRef.current >= 0 ? 'pointer' : 'grab';
  }
  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    isDraggingRef.current = false;
    if (hasDraggedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left - offsetRef.current.x) / scaleRef.current;
    const wy = (e.clientY - rect.top - offsetRef.current.y) / scaleRef.current;
    selectAtPoint(wx, wy, e.clientX, e.clientY);
  }

  function doSearch() {
    const q = search.trim();
    if (!q) return;
    if (q === lastLoadedRef.current) { loadToken(q); return; } // re-search same token
    router.push(`/app?token=${encodeURIComponent(q)}`); // URL effect triggers the load
  }

  function toggleHidden(addrs: string[]) {
    setHidden(prev => {
      const next = new Set(prev);
      const allHidden = addrs.every(a => next.has(a));
      for (const a of addrs) {
        if (allHidden) next.delete(a);
        else next.add(a);
      }
      return next;
    });
  }

  // Select from the sidebar: highlight + pan the map to the node
  function selectFromList(addr: string | null) {
    setSelectedAddr(addr);
    if (!addr) return;
    const g = simRef.current, canvas = canvasRef.current;
    if (!g || !canvas) return;
    const sn = g.nodes.find(n => n.node.address === addr);
    if (!sn) return; // hidden node — still highlights the row
    userTouchedViewRef.current = true;
    const { w, h } = sizeRef.current;
    offsetRef.current = {
      x: w / 2 - (sn.x || 0) * scaleRef.current,
      y: h / 2 - (sn.y || 0) * scaleRef.current,
    };
    const rect = canvas.getBoundingClientRect();
    setSelectedPos({ x: rect.left + w / 2, y: rect.top + h / 2 });
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {}
  }

  const selected = selectedAddr && graph ? graph.nodes[addrToIdx.get(selectedAddr) ?? -1] || null : null;

  // Wallets connected to the selected node by observed transfers (BubbleMaps'
  // "transactions with listed wallets" panel).
  const connections = useMemo(() => {
    if (!selectedAddr || !graph) return [];
    const idx = addrToIdx.get(selectedAddr);
    if (idx === undefined) return [];
    const byPeer = new Map<number, { out: number; in: number }>();
    for (const e of graph.edges) {
      if (e.from === idx) {
        const p = byPeer.get(e.to) || { out: 0, in: 0 };
        p.out += e.count; byPeer.set(e.to, p);
      } else if (e.to === idx) {
        const p = byPeer.get(e.from) || { out: 0, in: 0 };
        p.in += e.count; byPeer.set(e.from, p);
      }
    }
    return [...byPeer.entries()]
      .map(([peer, c]) => ({ node: graph.nodes[peer], ...c, total: c.in + c.out }))
      .sort((a, b) => b.total - a.total);
  }, [selectedAddr, graph, addrToIdx]);
  const holderCount = graph ? graph.nodes.filter(n => n.kind === 'holder').length : 0;
  const top10pct = graph
    ? graph.nodes.filter(n => n.kind === 'holder' && (n.rank || 999) <= 10).reduce((s, n) => s + n.pct, 0)
    : 0;

  function getPopupStyle(): React.CSSProperties {
    const W = 224, H = 165 + (connections.length ? Math.min(connections.length, 6) * 21 + 26 : 0);
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
    let left = selectedPos.x + 16, top = selectedPos.y - H / 2;
    if (left + W > vw - 10) left = selectedPos.x - W - 16;
    if (top < 60) top = 60;
    if (top + H > vh - 20) top = vh - H - 20;
    const borderColor = selected?.cluster !== undefined ? clusterColor(selected.cluster) + '66' : 'rgba(245,200,66,0.2)';
    return { position: 'fixed', top, left, width: W, background: 'rgba(15,12,0,0.97)', border: `1px solid ${borderColor}`, borderRadius: 10, padding: '10px 12px', zIndex: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.8)' };
  }

  void ageTick; // consumed for periodic re-render of the age pill
  void buildTick; // consumed for the per-second elapsed readout while building

  return (
    <div style={{ height: '100dvh', background: '#0a0800', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!isEmbed && (
      <nav style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid rgba(245,200,66,0.1)', gap: 8, flexShrink: 0, background: '#0a0800' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 19, textDecoration: 'none', color: '#f0ede6', flexShrink: 0 }}>
          <span>🍌</span><span className="nav-hide-mobile">Banana<span style={{ color: '#F5C842' }}>Maps</span></span>
        </a>
        {!isMobile && (
          <div style={{ display: 'flex', gap: 4 }}>
            {(['eth', 'bsc', 'sol', 'base', 'robinhood'] as const).map(c => (
              <button key={c} onClick={() => setChain(c)} style={{ background: chain === c ? 'rgba(245,200,66,0.08)' : 'transparent', border: `1px solid ${chain === c ? CC[c] : 'rgba(255,255,255,0.08)'}`, color: chain === c ? CC[c] : 'rgba(255,255,255,0.35)', borderRadius: 6, padding: '4px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: CC[c], marginRight: 4 }} />{c.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1, maxWidth: 700, display: 'flex', alignItems: 'center', background: 'rgba(245,200,66,0.04)', border: '1px solid rgba(245,200,66,0.12)', borderRadius: 8, padding: '0 10px', gap: 6 }}>
          {isMobile && (
            <select value={chain} onChange={e => setChain(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', color: CC[chain], fontSize: 11, cursor: 'pointer' }}>
              {['eth', 'bsc', 'sol', 'base', 'robinhood'].map(c => <option key={c} value={c} style={{ background: '#0a0a18' }}>{c.toUpperCase()}</option>)}
            </select>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="Token name or contract address..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#f5f0e8', fontSize: 13, padding: '9px 0', minWidth: 0 }} />
          <button onClick={doSearch} style={{ background: '#F5C842', color: '#000', border: 'none', borderRadius: 6, padding: '5px 8px', fontWeight: 700, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>{loading ? '...' : 'Go'}</button>
        </div>

        {/* Token identity + market chips */}
        {graph && !isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,200,66,0.06)', border: '1px solid rgba(245,200,66,0.2)', borderRadius: 16, padding: '4px 10px', minWidth: 0 }}>
              {graph.logo && <img src={graph.logo} alt="" style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />}
              <span style={{ fontSize: 12, fontWeight: 700, color: '#F5C842', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{graph.name || graph.symbol}</span>
              {graph.symbol && <span style={{ fontSize: 10, color: 'rgba(245,200,66,0.5)', whiteSpace: 'nowrap' }}>{graph.symbol}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '4px 10px', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#f0ede6' }}>{fmtPrice(graph.price)}</span>
              {graph.priceChange24h !== 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: graph.priceChange24h >= 0 ? '#2EE89A' : '#EF4444' }}>
                  {graph.priceChange24h >= 0 ? '▲' : '▼'} {Math.abs(graph.priceChange24h).toFixed(1)}%
                </span>
              )}
            </div>
            {cachedAt && (
              <button onClick={() => loadToken(graph.address, { refresh: true, chainOverride: graph.chain })} disabled={refreshing}
                title="Data age — click to recompute"
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '4px 10px', cursor: refreshing ? 'wait' : 'pointer', color: 'rgba(245,235,200,0.6)', fontSize: 10, whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>⟳</span>
                {refreshing ? 'updating…' : fmtAge(cachedAt)}
              </button>
            )}
            <button onClick={handleShare} title="Copy link"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '4px 10px', cursor: 'pointer', color: shared ? '#2EE89A' : 'rgba(245,235,200,0.6)', fontSize: 10, whiteSpace: 'nowrap' }}>
              {shared ? '✓ Copied' : '↗ Share'}
            </button>
          </div>
        )}

        <div style={{ flex: 1 }} className="nav-hide-mobile" />

        {/* Auth section */}
        {userEmail ? (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setShowUserMenu(!showUserMenu)} style={{
              background: 'rgba(245,200,66,0.08)', border: '1px solid rgba(245,200,66,0.2)', borderRadius: 8, padding: '6px 12px',
              color: '#F5C842', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2EE89A', display: 'inline-block' }} />
              <span className="nav-hide-mobile">{userEmail.length > 18 ? userEmail.slice(0, 16) + '...' : userEmail}</span>
              <span style={{ fontSize: 8 }}>▼</span>
            </button>
            {showUserMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'rgba(15,12,0,0.97)',
                border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, padding: '6px', minWidth: 220,
                boxShadow: '0 8px 30px rgba(0,0,0,0.6)', zIndex: 500,
              }}>
                <div style={{ padding: '8px 12px', fontSize: 10, color: 'rgba(245,200,66,0.4)', borderBottom: '1px solid rgba(245,200,66,0.08)', marginBottom: 4, wordBreak: 'break-all' }}>
                  {userEmail}
                </div>
                <button onClick={handleLogout} style={{
                  width: '100%', background: 'none', border: 'none', padding: '8px 12px', color: '#f5f0e8', fontSize: 12,
                  cursor: 'pointer', textAlign: 'left', borderRadius: 6, fontWeight: 500,
                }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,200,66,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => router.push('/login')} style={{
              background: 'none', border: '1px solid rgba(245,200,66,0.2)', borderRadius: 7, padding: '6px 14px',
              color: '#f5f0e8', fontSize: 11, cursor: 'pointer', fontWeight: 600,
            }}>Log in</button>
            <button onClick={() => router.push('/signup')} className="nav-hide-mobile" style={{
              background: '#F5C842', border: 'none', borderRadius: 7, padding: '6px 14px',
              color: '#000', fontSize: 11, cursor: 'pointer', fontWeight: 700,
            }}>Sign up</button>
          </div>
        )}

        {graph && isMobile && (
          <button onClick={() => setShowList(true)} style={{ background: 'rgba(245,200,66,0.08)', border: '1px solid rgba(100,120,200,0.2)', borderRadius: 6, padding: '6px 8px', color: 'rgba(245,200,66,0.8)', fontSize: 10, cursor: 'pointer', flexShrink: 0 }}>☰</button>
        )}
      </nav>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <div style={{ flex: 1, position: 'relative', background: '#0a0800' }}>
          <canvas ref={canvasRef}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            onMouseLeave={() => { isDraggingRef.current = false; hoveredIdxRef.current = -1; }}
            style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab', touchAction: 'none' }}
          />
          {!loading && building === null && !graph && (
            <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '100%', maxWidth: 680, padding: '36px 20px 60px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 44 }}>🍌</div>
                  <div style={{ fontSize: 16, color: 'rgba(245,235,200,0.85)', fontWeight: 700, marginTop: 6 }}>
                    {error || 'Explore token holder maps'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(245,235,200,0.35)', marginTop: 4 }}>
                    Search any token or paste a contract address
                  </div>
                  {/* The embed has no search bar, so an error needs its own way back */}
                  {isEmbed && error && urlToken && (
                    <button onClick={() => loadToken(urlToken, urlChain ? { chainOverride: urlChain } : undefined)}
                      style={{ marginTop: 12, background: '#F5C842', color: '#000', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      ↻ Try again
                    </button>
                  )}
                </div>
                {!isEmbed && discover && discover.popular.length > 0 && (
                  <>
                    <div style={{ fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(245,200,66,0.4)', marginTop: 18 }}>Popular maps · instant</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8 }}>
                      {discover.popular.slice(0, 9).map(t => <TokenTile key={`${t.chain}:${t.address}`} t={t} onOpen={openDiscoverToken} />)}
                    </div>
                  </>
                )}
                {!isEmbed && discover && discover.trending.length > 0 && (
                  <>
                    <div style={{ fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(245,200,66,0.4)', marginTop: 16 }}>
                      Trending now <span style={{ opacity: 0.6, textTransform: 'none', letterSpacing: 0 }}>· first map takes ~2 min to compute</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8 }}>
                      {discover.trending
                        .filter(t => !discover.popular.some(p => p.chain === t.chain && p.address === t.address))
                        .slice(0, 9)
                        .map(t => <TokenTile key={`${t.chain}:${t.address}`} t={t} onOpen={openDiscoverToken} />)}
                    </div>
                  </>
                )}
                <div style={{ fontSize: 10, color: 'rgba(180,180,255,0.2)', textAlign: 'center', marginTop: 18 }}>
                  {isMobile ? 'Pinch to zoom · Drag to pan' : 'Scroll to zoom · Drag to pan · Click a bubble for details'}
                </div>
              </div>
            </div>
          )}
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: 'rgba(10,8,0,0.9)' }}>
              <div style={{ fontSize: 44, animation: 'spin 1s linear infinite' }}>🍌</div>
              <div style={{ fontSize: 13, color: 'rgba(245,200,66,0.7)' }}>Mapping holders & transfers...</div>
              <div style={{ fontSize: 10, color: 'rgba(245,200,66,0.35)' }}>First load computes the full graph — can take a minute</div>
            </div>
          )}
          {!loading && building !== null && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, background: 'rgba(10,8,0,0.9)', padding: 20 }}>
              <div style={{ fontSize: 44, animation: 'spin 1s linear infinite' }}>🍌</div>
              <div style={{ fontSize: 14, color: 'rgba(245,200,66,0.85)', fontWeight: 700 }}>Building this holder map</div>
              <div style={{ fontSize: 11, color: 'rgba(245,235,200,0.45)', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
                First-time maps take ~2 minutes to compute.<br />This view refreshes automatically — no need to reload.
              </div>
              <div style={{ fontSize: 10, color: 'rgba(245,235,200,0.3)', fontFamily: 'DM Mono,monospace' }}>
                {fmtElapsed(Date.now() - building)} elapsed · checking every {Math.round(BUILD_POLL_MS / 1000)}s
              </div>
            </div>
          )}
          {error && graph && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(40,10,10,0.95)', border: '1px solid rgba(239,68,68,0.4)', color: '#f5b0b0', borderRadius: 8, padding: '8px 16px', fontSize: 11, zIndex: 150, display: 'flex', gap: 10, alignItems: 'center' }}>
              {error}
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, padding: 0 }}>×</button>
            </div>
          )}
          {graph && (
            <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'stretch' }}>
                <div style={{ background: 'rgba(0,0,0,0.75)', border: `1px solid ${CC[graph.chain]}44`, borderRadius: 16, padding: '4px 10px', fontSize: 10, color: CC[graph.chain], display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: CC[graph.chain], display: 'inline-block' }} />{CL[graph.chain]}
                </div>
                {(isMobile || isEmbed) && (
                  <div style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(245,200,66,0.25)', borderRadius: 16, padding: '4px 10px', fontSize: 11, color: '#F5C842', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {graph.logo && <img src={graph.logo} alt="" style={{ width: 14, height: 14, borderRadius: '50%' }} onError={e => (e.currentTarget.style.display = 'none')} />}
                    {graph.name || graph.symbol}
                    <span style={{ color: 'rgba(240,237,230,0.9)' }}>{fmtPrice(graph.price)}</span>
                    {graph.priceChange24h !== 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: graph.priceChange24h >= 0 ? '#2EE89A' : '#EF4444' }}>
                        {graph.priceChange24h >= 0 ? '▲' : '▼'}{Math.abs(graph.priceChange24h).toFixed(1)}%
                      </span>
                    )}
                  </div>
                )}
                {([
                  ['Holders', graph.totalHolders ? fAmt(graph.totalHolders) : holderCount, graph.totalHolders ? `top ${holderCount} mapped` : undefined],
                  ['Top 10', Math.round(top10pct) + '%', undefined],
                  ['Clusters', graph.clusters.length, undefined],
                  ...(graph.marketCap ? [['MCap', fUSD(graph.marketCap), undefined]] : []),
                  ...(graph.volume24h ? [['24h Vol', fUSD(graph.volume24h), undefined]] : []),
                ] as [string, string | number, string | undefined][]).map(([l, v, tip]) => (
                  <div key={l} title={tip} style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(100,120,200,0.15)', borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, color: 'rgba(245,200,66,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>{l}</span>
                    <span style={{ fontSize: 13, color: 'rgba(220,220,255,0.9)', fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
                {rugScore && (
                  <div onClick={() => setShowRugDetails(!showRugDetails)} style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${rugScore.color}55`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: rugScore.color, display: 'inline-block', boxShadow: `0 0 6px ${rugScore.color}66` }} />
                    <span style={{ fontSize: 13, color: rugScore.color, fontWeight: 800 }}>{rugScore.score}</span>
                    <span style={{ fontSize: 10, color: rugScore.color, opacity: 0.8, fontWeight: 600 }}>{rugScore.label}</span>
                    <span style={{ fontSize: 8, color: rugScore.color, opacity: 0.6 }}>{showRugDetails ? '▲' : '▼'}</span>
                  </div>
                )}
              </div>
              {rugScore && showRugDetails && (
                <div style={{ background: 'rgba(0,0,0,0.85)', border: `1px solid ${rugScore.color}33`, borderRadius: 10, padding: '12px', marginTop: 6, maxWidth: 360 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: rugScore.color }}>Risk Analysis — {rugScore.score}/100</div>
                    <button onClick={() => setShowRugDetails(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                  {rugScore.factors.map(f => (
                    <div key={f.name} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{f.name}</span>
                        <span style={{ fontSize: 10, color: f.score >= 70 ? '#2EE89A' : f.score >= 40 ? '#EAB308' : '#EF4444', fontWeight: 700 }}>{f.score}/100</span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${f.score}%`, background: f.score >= 70 ? '#2EE89A' : f.score >= 40 ? '#EAB308' : '#EF4444', borderRadius: 2, transition: 'width 0.5s' }} />
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{f.detail}</div>
                    </div>
                  ))}
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', marginTop: 8, lineHeight: 1.4 }}>This score is for informational purposes only and does not constitute financial advice. Always do your own research.</div>
                </div>
              )}
            </div>
          )}
          {!isMobile && graph && graph.clusters.length > 0 && (
            <div style={{ position: 'absolute', bottom: 52, left: 12, display: 'flex', gap: 5, flexWrap: 'wrap', maxWidth: 500 }}>
              {graph.clusters.slice(0, 8).map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.65)', border: `1px solid ${clusterColor(c.id)}44`, borderRadius: 10, padding: '2px 8px', fontSize: 9, color: clusterColor(c.id) }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: clusterColor(c.id), display: 'inline-block' }} />Cluster {c.id + 1} · {c.pct.toFixed(1)}%
                </div>
              ))}
            </div>
          )}
          {isEmbed && (
            <a href={`https://www.bananamaps.io/app?token=${encodeURIComponent(urlToken || '')}${urlChain ? `&chain=${encodeURIComponent(urlChain)}` : ''}`}
              target="_blank" rel="noopener noreferrer"
              style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(245,200,66,0.25)', borderRadius: 16, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#f0ede6', textDecoration: 'none', zIndex: 150 }}>
              🍌 Banana<span style={{ color: '#F5C842' }}>Maps</span>
              <span style={{ color: 'rgba(245,235,200,0.55)', fontWeight: 500 }}>· Open full map ↗</span>
            </a>
          )}
          {isEmbed && graph && (
            <button onClick={() => setEmbedListOpen(v => !v)}
              style={{ position: 'absolute', top: 10, right: 10, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(245,200,66,0.25)', borderRadius: 16, padding: '5px 12px', fontSize: 10, fontWeight: 600, color: 'rgba(245,235,200,0.8)', cursor: 'pointer', zIndex: 150 }}>
              ☰ Holders
            </button>
          )}
          {isEmbed && embedListOpen && graph && (
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 270, background: 'rgba(10,8,0,0.97)', borderLeft: '1px solid rgba(245,200,66,0.15)', zIndex: 160, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px 0' }}>
                <button onClick={() => setEmbedListOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: 24, height: 24, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <AddressList
                  graph={graph}
                  hidden={hidden}
                  toggleHidden={toggleHidden}
                  selectedAddr={selectedAddr}
                  onSelect={selectFromList}
                  onHoverAddr={addr => { hoveredIdxRef.current = addr !== null ? (addrToIdx.get(addr) ?? -1) : -1; }}
                  query={query}
                  setQuery={setQuery}
                  ungroup={ungroup}
                  setUngroup={setUngroup}
                  expanded={expanded}
                  toggleExpanded={id => setExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id); else next.add(id);
                    return next;
                  })}
                />
              </div>
            </div>
          )}
          {graph && (
            <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[['＋', 1.2], ['－', 0.8], ['⊙', 0]].map(([l, f]) => (
                <button key={l as string} onClick={() => {
                  if (f === 0) { userTouchedViewRef.current = false; autoFit(); return; }
                  // Zoom about the canvas center, like the wheel handler does about the cursor
                  userTouchedViewRef.current = true;
                  const { w, h } = sizeRef.current;
                  const ns = Math.min(Math.max(scaleRef.current * (f as number), 0.05), 8);
                  offsetRef.current.x = w / 2 - (w / 2 - offsetRef.current.x) * (ns / scaleRef.current);
                  offsetRef.current.y = h / 2 - (h / 2 - offsetRef.current.y) * (ns / scaleRef.current);
                  scaleRef.current = ns;
                }} style={{ width: 30, height: 30, background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(100,120,200,0.2)', borderRadius: 7, color: 'rgba(245,200,66,0.5)', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div style={getPopupStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: selected.cluster !== undefined ? clusterColor(selected.cluster) : 'rgba(160,170,220,0.9)' }} />
                  <span style={{ fontSize: 10, color: 'rgba(180,180,220,0.5)', fontFamily: 'DM Mono,monospace' }}>{selected.rank !== undefined ? `#${selected.rank}` : 'counterparty'}</span>
                  {selected.cluster !== undefined && (
                    <span style={{ fontSize: 9, color: clusterColor(selected.cluster), background: clusterColor(selected.cluster) + '15', padding: '1px 6px', borderRadius: 8, border: `1px solid ${clusterColor(selected.cluster)}33` }}>C{selected.cluster + 1}</span>
                  )}
                  {selected.label && <span style={{ fontSize: 9, color: '#B8BCC8' }}>{selected.label}</span>}
                </div>
                <button onClick={() => setSelectedAddr(null)} style={{ background: 'none', border: 'none', color: 'rgba(200,170,80,0.4)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
              </div>
              <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 9, color: 'rgba(245,200,66,0.6)', marginBottom: 8, wordBreak: 'break-all' }}>{selected.address.slice(0, 10)}...{selected.address.slice(-8)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 8 }}>
                {[['Supply', selected.pct ? selected.pct.toFixed(selected.pct < 0.01 ? 4 : 2) + '%' : '—', 'rgba(220,220,255,0.9)'], ['Amount', selected.balanceFormatted ? fAmt(selected.balanceFormatted) : '—', 'rgba(220,220,255,0.9)'], ['USD', selected.usdValue ? fUSD(selected.usdValue) : '—', '#2EE89A']].map(([l, v, c]) => (
                  <div key={l as string} style={{ background: 'rgba(245,200,66,0.04)', borderRadius: 6, padding: '5px 6px' }}>
                    <div style={{ fontSize: 7, color: 'rgba(200,170,80,0.4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: 12, color: c as string, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
              {connections.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 8, color: 'rgba(200,170,80,0.45)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                    Transfers with {connections.length} wallet{connections.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ maxHeight: 6 * 21, overflowY: 'auto' }}>
                    {connections.slice(0, 12).map(c => (
                      <div key={c.node.address}
                        onClick={() => selectFromList(c.node.address)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 4px', borderRadius: 4, cursor: 'pointer', fontSize: 9 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,200,66,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: c.node.cluster !== undefined ? clusterColor(c.node.cluster) : 'rgba(140,150,190,0.7)' }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'DM Mono,monospace', color: c.node.label ? '#B8BCC8' : 'rgba(245,235,200,0.7)' }}>
                          {c.node.label || `${c.node.address.slice(0, 6)}...${c.node.address.slice(-4)}`}
                        </span>
                        <span style={{ color: 'rgba(180,180,220,0.5)', flexShrink: 0 }}>
                          {c.out > 0 && c.in > 0 ? '⇄' : c.out > 0 ? '→' : '←'} {c.total}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => window.open(`${EXPLORER[graph?.chain || 'eth']}/${selected.address}`, '_blank')} style={{ width: '100%', background: 'rgba(245,200,66,0.04)', border: '1px solid rgba(245,200,66,0.12)', borderRadius: 6, padding: '5px', color: 'rgba(245,200,66,0.5)', fontSize: 10, cursor: 'pointer', fontWeight: 500 }}>
                View on Explorer ↗
              </button>
            </div>
          )}
        </div>

        {!isMobile && !isEmbed && (
          <div style={{ width: 270, borderLeft: '1px solid rgba(245,200,66,0.08)', background: '#0a0800', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {graph ? (
              <AddressList
                graph={graph}
                hidden={hidden}
                toggleHidden={toggleHidden}
                selectedAddr={selectedAddr}
                onSelect={selectFromList}
                onHoverAddr={addr => { hoveredIdxRef.current = addr !== null ? (addrToIdx.get(addr) ?? -1) : -1; }}
                query={query}
                setQuery={setQuery}
                ungroup={ungroup}
                setUngroup={setUngroup}
                expanded={expanded}
                toggleExpanded={id => setExpanded(prev => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, height: '100%', color: 'rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: 28 }}>🍌</div><div style={{ fontSize: 11 }}>Select a token</div>
              </div>
            )}
          </div>
        )}

        {isMobile && showList && graph && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowList(false)} />
            <div style={{ background: 'rgba(12,10,0,0.99)', borderRadius: '18px 18px 0 0', borderTop: '1px solid rgba(245,200,66,0.12)', height: '70vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowList(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: 26, height: 26, color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <AddressList
                  graph={graph}
                  hidden={hidden}
                  toggleHidden={toggleHidden}
                  selectedAddr={selectedAddr}
                  onSelect={addr => { selectFromList(addr); setShowList(false); }}
                  onHoverAddr={() => {}}
                  query={query}
                  setQuery={setQuery}
                  ungroup={ungroup}
                  setUngroup={setUngroup}
                  expanded={expanded}
                  toggleExpanded={id => setExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id); else next.add(id);
                    return next;
                  })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function AppClient({ embed = false }: { embed?: boolean }) {
  return <Suspense><AppContent embed={embed} /></Suspense>;
}
