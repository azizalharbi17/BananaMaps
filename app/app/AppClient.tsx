'use client';
import { useEffect, useRef, useState, Suspense, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TokenGraph } from '@/lib/graphTypes';
import { buildSim, drawGraph, findNodeAt, GraphSim, clusterColor } from '@/lib/mapEngine';
import { toViewGraph } from '@/lib/graphView';
import { THEME, TYPE_COLORS, CHAIN_COLORS, CHAIN_TEXT_COLORS, hexA } from '@/lib/theme';
import { calculateRugScore, RugScoreResult } from '@/lib/rugScore';
import { supabase } from '@/lib/supabase';
import { isFirstPartyHost, type EmbedPlan } from '@/lib/plans';
import AddressList, { explorerHolderUrl, TYPE_META, TypeIcon, shortAddr, fmtPct } from './AddressList';

const CHAINS = ['eth', 'bsc', 'sol', 'base', 'robinhood'] as const;
const CHAIN_LABEL: Record<string, string> = { eth: 'Ethereum', bsc: 'BSC', sol: 'Solana', base: 'Base', robinhood: 'Robinhood' };
// Unclustered wallets on the map are navy; their dot in the popup / transfers list
// uses the same rim tone as lib/mapEngine.
const UNCLUSTERED_DOT = 'rgba(128,148,200,0.9)';
// Error surfaces (toast, inline notices): down-tinted border + soft red text.
const ERROR_BORDER = 'rgba(229,72,77,0.45)';
const ERROR_TEXT = '#F3A7AA';
// Translucent cover for the loading / building overlays and the legend box.
const COVER = 'rgba(15,17,21,0.9)';

// BananaMaps Embed options, resolved server-side in app/embed/page.tsx from the
// partner id (?pid=) and the partner's current plan. `valid` is false when no
// pid was given or it is unknown/revoked; `badge` false and `accent` only ever
// arrive for the Partner plan.
export interface EmbedOptions {
  pid: string | null;
  plan: EmbedPlan | null;
  valid: boolean;
  /** Show the "Powered by BananaMaps" badge (required on the free plan). */
  badge: boolean;
  /** Partner accent color (#RRGGBB) replacing the accent in the embed chrome. */
  accent: string | null;
  /** Host sites the partner registered; empty = any site. */
  domains: string[];
}

const DEVELOPERS_EMBED_URL = 'https://www.bananamaps.io/developers/embed';

/** Hostname of the page framing us, or null when it cannot be determined. */
function embedParentHost(): string | null {
  try {
    const origin = window.location.ancestorOrigins?.[0] || document.referrer || '';
    if (!origin) return null;
    return new URL(origin).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** "*.example.com" matches subdomains; "example.com" matches itself and subdomains. */
function hostMatchesEntry(host: string, entry: string): boolean {
  const e = entry.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!e) return false;
  if (e.startsWith('*.')) return host.endsWith(e.slice(1));
  return host === e || host.endsWith('.' + e);
}

/**
 * Whether this embed may render for the page framing it. Direct (top-level)
 * visits and our own properties always may; otherwise an active partner id is
 * required and, when it lists domains, the host must match one of them.
 */
type EmbedGateReason = 'nopid' | 'invalid' | 'domain';
function embedGateReason(opts: EmbedOptions | undefined): EmbedGateReason | null {
  try {
    if (window.self === window.top) return null;
    const host = embedParentHost();
    if (host && isFirstPartyHost(host)) return null;
    if (!opts?.valid) return opts?.pid ? 'invalid' : 'nopid';
    if (opts.domains.length === 0) return null;
    // The partner id is the credential; the domain list is a best-effort lock that
    // can only be checked when the browser exposes the framing page's origin
    // (Firefox has no ancestorOrigins and a strict referrer policy hides it).
    if (!host) return null;
    return opts.domains.some(d => hostMatchesEntry(host, d)) ? null : 'domain';
  } catch {
    return 'nopid';
  }
}

const gateShell: React.CSSProperties = {
  height: '100dvh', background: THEME.bg, color: THEME.text, fontFamily: THEME.fontSans,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px',
  overflowX: 'hidden', overflowY: 'auto', boxSizing: 'border-box',
};
const gateCard: React.CSSProperties = {
  width: '100%', maxWidth: 420, textAlign: 'center', background: THEME.surface,
  border: `1px solid ${THEME.border}`, borderRadius: THEME.radiusCard, padding: '26px 22px', boxSizing: 'border-box',
};
const gateEyebrow: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: THEME.text2 };
const gateTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, lineHeight: 1.3, margin: '10px 0 8px', color: THEME.text };
const gateBody: React.CSSProperties = { fontSize: 13, lineHeight: 1.55, margin: 0, color: THEME.text2 };
const gateButton: React.CSSProperties = {
  display: 'inline-block', marginTop: 16, background: THEME.accent, color: THEME.accentInk,
  borderRadius: THEME.radiusControl, padding: '8px 16px', fontWeight: 700, fontSize: 13, textDecoration: 'none',
};

// Shown inside the frame instead of the map when the host site has no active
// partner id. Stays within the frame at any size — no horizontal scroll.
function EmbedGate({ reason }: { reason: EmbedGateReason }) {
  const pidInvalid = reason === 'invalid';
  if (reason === 'domain') {
    return (
      <div style={gateShell}>
        <div style={gateCard}>
          <div style={gateEyebrow}>🍌 BananaMaps Embed</div>
          <h1 style={gateTitle}>This page isn’t on the key’s domain list</h1>
          <p style={gateBody}>The partner id is valid, but this site’s domain isn’t listed for it. Add the domain in the BananaMaps dashboard, or clear the list to allow any site.</p>
          <a href="https://www.bananamaps.io/developers/dashboard" target="_blank" rel="noopener noreferrer" style={gateButton}>
            Open the dashboard
          </a>
        </div>
      </div>
    );
  }
  return (
    <div style={gateShell}>
      <div style={gateCard}>
        <div style={gateEyebrow}>🍌 BananaMaps Embed</div>
        <h1 style={gateTitle}>This site needs a BananaMaps Embed key</h1>
        <p style={gateBody}>Live holder maps are free to embed with a partner id. Get one in a minute.</p>
        <a href={DEVELOPERS_EMBED_URL} target="_blank" rel="noopener noreferrer" style={gateButton}>
          Get a free Embed key
        </a>
        <div style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 14, color: THEME.text2, overflowWrap: 'anywhere' }}>
          Already have one? Add <code style={{ fontFamily: THEME.fontMono, color: THEME.text, background: THEME.well, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: '1px 5px', fontSize: 11 }}>?pid=your_id</code> to the embed URL.
        </div>
        {pidInvalid && (
          <div style={{ fontSize: 11.5, marginTop: 8, color: ERROR_TEXT }}>The pid in this URL is not active.</div>
        )}
      </div>
    </div>
  );
}

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
// Refresh on a worker-indexed token: the API queues a priority sync and returns
// the current snapshot; poll briefly for the newer one before giving up quietly.
const INDEXED_REFRESH_POLL_MS = 10_000;
const INDEXED_REFRESH_POLLS = 9;

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
// Popup figures: full digits with separators ("12,301,900"), abbreviated only
// once they would no longer fit the 280px card.
function fBalance(n: number): string {
  if (n >= 1e12) return fAmt(n);
  return n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : 2 });
}
function fUSDFull(n: number): string {
  if (n >= 1e9) return fUSD(n);
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : 2 });
}

interface DiscoverToken {
  chain: string;
  address: string;
  name: string;
  symbol: string;
  logo: string;
  change24h: number;
}

function SearchIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={THEME.text2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function TokenTile({ t, onOpen }: { t: DiscoverToken; onOpen: (addr: string, chain?: string) => void }) {
  return (
    <button onClick={() => onOpen(t.address, t.chain)} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', cursor: 'pointer', textAlign: 'left',
      background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: THEME.radiusCard, minWidth: 0,
      color: THEME.text, fontFamily: 'inherit', transition: 'border-color 150ms',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.borderStrong; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = THEME.border; }}>
      {t.logo ? (
        <img src={t.logo} alt="" style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />
      ) : (
        <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: THEME.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: THEME.text2, fontWeight: 600 }}>{(t.symbol || '?')[0]}</span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.symbol || t.name}</span>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: CHAIN_COLORS[t.chain] || THEME.text3, flexShrink: 0 }} />
        </span>
        <span style={{ display: 'block', fontSize: 11, color: THEME.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
      </span>
      {t.change24h !== 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: t.change24h >= 0 ? THEME.up : THEME.down }}>
          {t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(1)}%
        </span>
      )}
    </button>
  );
}

// Shared control looks (inline-styled screen; mirrors .bm-btn-* in globals.css).
const ghostBtn: React.CSSProperties = {
  background: 'none', border: `1px solid ${THEME.borderStrong}`, borderRadius: THEME.radiusControl, padding: '6px 12px',
  color: THEME.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', height: 32,
};
const primaryBtn: React.CSSProperties = {
  background: THEME.accent, border: `1px solid ${THEME.accent}`, borderRadius: THEME.radiusControl, padding: '6px 12px',
  color: THEME.accentInk, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', height: 32,
};
const textBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: '6px 10px', color: THEME.text, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', height: 32,
};
const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: THEME.text2, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, fontFamily: 'inherit',
};
const dot = (color: string, size = 6): React.CSSProperties => ({
  width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0,
});
const statLabel: React.CSSProperties = { color: THEME.text2, fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 };
const statValue: React.CSSProperties = { color: THEME.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginLeft: 4 };

function AppContent({ embed = false, embedOptions }: { embed?: boolean; embedOptions?: EmbedOptions }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const simRef = useRef<GraphSim | null>(null);
  const graphRef = useRef<TokenGraph | null>(null); // the DRAWN graph (view), read by the rAF loop and hit-testing
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
  // partner sites (e.g. BananaScreener) — no top bar, compact sidebar drawer,
  // attribution link instead. Also switches first builds to non-blocking polling.
  const isEmbed = embed || searchParams.get('embed') === '1';
  // Partner accent replaces the theme accent in three embed-chrome spots only: the
  // badge suffix, the token pill text and the Holders button border.
  const accent = embedOptions?.accent || THEME.accent;
  const showBadge = embedOptions?.badge !== false;
  // Embed gate: null until the mount effect inspects the framing page; the map
  // is never fetched or drawn while it is anything but true. Non-embed = true.
  const [embedAllowed, setEmbedAllowed] = useState<boolean | null>(isEmbed ? null : true);
  const [embedGate, setEmbedGate] = useState<EmbedGateReason | null>(null);
  useEffect(() => {
    if (!isEmbed) return;
    const reason = embedGateReason(embedOptions);
    setEmbedGate(reason);
    setEmbedAllowed(reason === null);
  }, [isEmbed, embedOptions]);
  const [search, setSearch] = useState(searchParams.get('token') || '');
  const [chain, setChain] = useState('eth');
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState<number | null>(null); // build start ts while the server computes
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<TokenGraph | null>(null); // raw API graph (every counterparty)
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [ageTick, setAgeTick] = useState(0); // re-render for the "Updated …" readout
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedAddr, setSelectedAddr] = useState<string | null>(null);
  const [hoveredAddr, setHoveredAddr] = useState<string | null>(null); // bubble under the cursor → list row highlight
  const hoveredAddrRef = useRef<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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

  // Visual v2: everything the user sees is derived from the shaped view graph
  // (lib/graphView). The raw graph is kept only for the popup's transfers list.
  const view = useMemo(() => (graph ? toViewGraph(graph) : null), [graph]);

  // Discovery grid data for the empty state (the embed never shows it)
  useEffect(() => {
    if (isEmbed) return;
    fetch('/api/trending')
      .then(r => r.json())
      .then(d => setDiscover({ popular: d.popular || [], trending: d.trending || [] }))
      .catch(() => {});
  }, [isEmbed]);

  function openDiscoverToken(addr: string, tokenChain?: string) {
    router.push(`/app?token=${encodeURIComponent(addr)}${tokenChain ? `&chain=${encodeURIComponent(tokenChain)}` : ''}`);
  }

  const addrToIdx = useMemo(() => {
    const m = new Map<string, number>();
    view?.nodes.forEach((n, i) => m.set(n.address, i));
    return m;
  }, [view]);

  // Keep refs in sync for the rAF loop
  useEffect(() => { graphRef.current = view; }, [view]);
  useEffect(() => {
    selectedIdxRef.current = selectedAddr !== null ? (addrToIdx.get(selectedAddr) ?? -1) : -1;
  }, [selectedAddr, addrToIdx]);
  const applyQueryHighlight = useCallback(() => {
    const q = query.trim().toLowerCase();
    if (!q || !view) { highlightRef.current = new Set(); return; }
    highlightRef.current = new Set(
      view.nodes
        .filter(n => n.address.toLowerCase().includes(q) || (n.label || '').toLowerCase().includes(q))
        .map(n => n.address),
    );
  }, [query, view]);
  useEffect(() => { applyQueryHighlight(); }, [applyQueryHighlight]);
  // Legend row hover: light up that cluster's members on the map
  function highlightCluster(id: number | null) {
    const g = graphRef.current;
    if (id === null || !g) { applyQueryHighlight(); return; }
    const members = g.clusters.find(c => c.id === id)?.members || [];
    highlightRef.current = new Set(members.map(i => g.nodes[i].address));
  }

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

  // Refresh the "Updated Xm ago" readout once a minute
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

  // Build / rebuild the simulation when the view graph or hidden set changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    hoveredIdxRef.current = -1; // node indices are only valid within one graph
    if (!view || !canvas) { simRef.current = null; return; }
    syncCanvasSize(canvas);
    const prev = simRef.current;
    const g = buildSim(view, hidden, sizeRef.current.w, sizeRef.current.h);
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
    if (process.env.NODE_ENV === 'development') (window as unknown as { __simDebug?: unknown }).__simDebug = { sim: g, size: { ...sizeRef.current } };
  }, [view, hidden]);

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
      // Flat navy field, a shade deeper at the edges — the theme's one radial.
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
      bg.addColorStop(0, THEME.mapBgCenter); bg.addColorStop(1, THEME.mapBg);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
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
      const baseParams = () => {
        const p = new URLSearchParams({ token: input.trim(), chain: opts?.chainOverride || chain });
        // Partner-plan embeds ask the API to queue a worker refresh of snapshots
        // older than 10 minutes (initial load, polls and refreshes alike).
        if (isEmbed && embedOptions?.pid) p.set('pid', embedOptions.pid); // the server decides whether the plan includes priority refresh
        return p;
      };
      const params = baseParams();
      if (opts?.refresh) params.set('refresh', '1');
      // An iframe visitor can't sit on a 1-3 min build request — ask the API to
      // build in the background (202) and poll until the snapshot lands.
      else if (isEmbed) params.set('wait', '0');
      let res = await fetch(`/api/graph?${params}`);
      let data = await res.json();
      if (reqSeqRef.current !== myReq) return;
      if (opts?.refresh && res.ok && data.graph && data.indexed && data.revalidating) {
        const prevAt = data.cachedAt;
        for (let i = 0; i < INDEXED_REFRESH_POLLS; i++) {
          await new Promise(r => setTimeout(r, INDEXED_REFRESH_POLL_MS));
          if (!aliveRef.current || reqSeqRef.current !== myReq) return;
          try {
            const p = baseParams();
            p.set('poll', '1');
            const r2 = await fetch(`/api/graph?${p}`);
            const d2 = await r2.json();
            if (r2.ok && d2.graph && d2.cachedAt !== prevAt) { res = r2; data = d2; break; }
          } catch { /* transient — keep polling */ }
        }
      }
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
      // Shape once here for the per-load derived state (hidden set, rug score);
      // the render side derives the same view from `graph` via useMemo.
      const v = toViewGraph(g);
      const sameToken = graphRef.current && graphRef.current.chain === g.chain && graphRef.current.address === g.address;
      setGraph(g);
      setCachedAt(data.cachedAt || g.computedAt);
      setChain(g.chain);
      if (!opts?.refresh || !sameToken) {
        // CEX / DEX / burn / contract wallets start hidden (BubbleMaps default)
        setHidden(new Set(v.nodes.filter(n => n.labelType).map(n => n.address)));
        setExpanded(new Set());
        setQuery('');
        setUngroup(false);
        simRef.current = null; // force fresh layout
      }
      const holders = v.nodes.filter(n => n.kind === 'holder');
      // Rug-score inputs: only exchange-like labels exclude a wallet from concentration
      // math (contracts like vesting wallets are real holders). Every view cluster
      // already holds ≥2 top holders, so the drawn cluster count is the suspicious one.
      setRugScore(calculateRugScore(
        holders.map(h => ({ pct: h.pct, cluster: h.cluster, address: h.address, isLabeledExchange: !!h.labelType && h.labelType !== 'contract' })),
        v.clusters.length,
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
  }, [chain, isEmbed, embedOptions?.plan]);

  // URL-driven loading: covers first mount, in-app searches (router.push), and
  // browser back/forward — the URL is the source of truth for which token shows.
  const urlToken = searchParams.get('token');
  const urlChain = searchParams.get('chain');
  const [embedListOpen, setEmbedListOpen] = useState(false);
  useEffect(() => {
    // An embed waits for the gate decision; a blocked embed never loads anything.
    if (embedAllowed !== true) return;
    if (urlToken && urlToken !== lastLoadedRef.current) {
      setSearch(urlToken);
      loadToken(urlToken, urlChain ? { chainOverride: urlChain } : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken, embedAllowed]);

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
    const g = simRef.current, drawn = graphRef.current;
    if (!g || !drawn) return;
    const idx = findNodeAt(g, wx, wy, scaleRef.current);
    if (idx >= 0) {
      const node = drawn.nodes[idx];
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
    const addr = hoveredIdxRef.current >= 0 ? graphRef.current?.nodes[hoveredIdxRef.current]?.address ?? null : null;
    if (addr !== hoveredAddrRef.current) { hoveredAddrRef.current = addr; setHoveredAddr(addr); }
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

  const toggleExpanded = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selected = selectedAddr && view ? view.nodes[addrToIdx.get(selectedAddr) ?? -1] || null : null;

  // Wallets connected to the selected node by observed transfers (BubbleMaps'
  // "transactions with listed wallets" panel). This is the ONE place the raw
  // graph is read: the full counterparty count stays visible even though the map
  // folds one-off spokes away. Peers absent from the view are flagged (`drawn`)
  // and take their dot color from the VIEW cluster id — raw ids are renumbered.
  const rawAddrToIdx = useMemo(() => {
    const m = new Map<string, number>();
    graph?.nodes.forEach((n, i) => m.set(n.address, i));
    return m;
  }, [graph]);
  const connections = useMemo(() => {
    if (!selectedAddr || !graph || !view) return [];
    const idx = rawAddrToIdx.get(selectedAddr);
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
      .map(([peer, c]) => {
        const node = graph.nodes[peer];
        const vi = addrToIdx.get(node.address);
        return { node, ...c, total: c.in + c.out, drawn: vi !== undefined, cluster: vi !== undefined ? view.nodes[vi].cluster : undefined };
      })
      .sort((a, b) => b.total - a.total);
  }, [selectedAddr, graph, view, rawAddrToIdx, addrToIdx]);
  const holderCount = view ? view.nodes.filter(n => n.kind === 'holder').length : 0;
  const top10pct = view
    ? view.nodes.filter(n => n.kind === 'holder' && (n.rank || 999) <= 10).reduce((s, n) => s + n.pct, 0)
    : 0;

  function getPopupStyle(): React.CSSProperties {
    const W = 280, H = 236 + (connections.length ? Math.min(connections.length, 6) * 26 + 30 : 0);
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
    const minTop = isEmbed ? 48 : 100; // below the top bar + stats strip
    let left = selectedPos.x + 16, top = selectedPos.y - H / 2;
    if (left + W > vw - 10) left = selectedPos.x - W - 16;
    if (top < minTop) top = minTop;
    if (top + H > vh - 20) top = vh - H - 20;
    return {
      position: 'fixed', top, left, width: W, boxSizing: 'border-box', background: THEME.surface,
      border: `1px solid ${THEME.borderStrong}`, borderRadius: THEME.radiusCard, padding: '12px 14px', zIndex: 200,
      boxShadow: THEME.shadowPopup, display: 'flex', flexDirection: 'column', gap: 10, color: THEME.text,
    };
  }

  // Stats strip: the scrollbar is hidden, so edge fades mark the side(s) where
  // content continues (--fade-l / --fade-r on the element) and a vertical wheel
  // scrolls the row sideways — otherwise mouse users at tablet widths could never
  // reach the trailing items (Risk).
  const stripRef = useRef<HTMLDivElement>(null);
  const updateStripFade = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.style.setProperty('--fade-l', el.scrollLeft > 1 ? '24px' : '0px');
    el.style.setProperty('--fade-r', max - el.scrollLeft > 1 ? '24px' : '0px');
  }, []);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    updateStripFade();
    const ro = new ResizeObserver(updateStripFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, rugScore, isMobile, isEmbed, updateStripFade]);
  const handleStripWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) el.scrollLeft += e.deltaY;
  };

  void ageTick; // consumed for periodic re-render of the "Updated …" readout
  void buildTick; // consumed for the per-second elapsed readout while building

  // Host site without an active partner id: the "get a key" panel replaces the map.
  if (isEmbed && embedAllowed === false) {
    return <EmbedGate reason={embedGate ?? 'nopid'} />;
  }

  const chainColor = view ? (CHAIN_COLORS[view.chain] || THEME.text2) : THEME.text2;
  const priceChange = view && view.priceChange24h !== 0 ? (
    <span style={{ fontSize: 11.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: view.priceChange24h >= 0 ? THEME.up : THEME.down }}>
      {view.priceChange24h >= 0 ? '▲' : '▼'} {Math.abs(view.priceChange24h).toFixed(1)}%
    </span>
  ) : null;
  const stats: [string, string | number, string | undefined][] = view ? [
    ['Holders', view.totalHolders ? view.totalHolders.toLocaleString('en-US') : holderCount, view.totalHolders ? `top ${holderCount} mapped` : undefined],
    ['Top 10', top10pct.toFixed(1) + '%', undefined],
    ['Clusters', view.clusters.length, undefined],
    ...(view.marketCap ? [['Market cap', fUSD(view.marketCap), undefined] as [string, string, undefined]] : []),
    ...(view.volume24h ? [['24h volume', fUSD(view.volume24h), undefined] as [string, string, undefined]] : []),
  ] : [];
  const addressListShared = {
    hidden, toggleHidden, selectedAddr, query, setQuery, ungroup, setUngroup, expanded, toggleExpanded,
  };

  return (
    <div style={{ height: '100dvh', background: THEME.bg, color: THEME.text, fontFamily: THEME.fontSans, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!isEmbed && (
      <nav style={{ height: 52, boxSizing: 'border-box', display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: `1px solid ${THEME.border}`, gap: 12, flexShrink: 0, background: THEME.surface }}>
        <Link href="/" prefetch={false} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 17, letterSpacing: -0.3, textDecoration: 'none', color: THEME.text, flexShrink: 0 }}>
          <span style={{ fontSize: 17, lineHeight: 1 }} aria-hidden="true">🍌</span>
          <span className="nav-hide-mobile">Banana<span style={{ color: THEME.accent }}>Maps</span></span>
        </Link>
        {!isMobile && (
          <div role="group" aria-label="Chain" style={{ display: 'flex', height: 32, border: `1px solid ${THEME.border}`, borderRadius: THEME.radiusControl, overflow: 'hidden', flexShrink: 0 }}>
            {CHAINS.map((c, i) => {
              const active = chain === c;
              return (
                <button key={c} onClick={() => setChain(c)} aria-pressed={active} style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', background: active ? THEME.surface3 : 'transparent',
                  border: 'none', borderRight: i < CHAINS.length - 1 ? `1px solid ${THEME.border}` : 'none',
                  color: active ? THEME.text : THEME.text2, fontSize: 11.5, fontWeight: active ? 700 : 600, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background-color 150ms, color 150ms',
                }}>
                  <span style={dot(CHAIN_COLORS[c], 5)} />{c.toUpperCase()}
                </button>
              );
            })}
          </div>
        )}
        <div className="bm-app-search" style={{ flex: 1, minWidth: 0, maxWidth: isMobile ? undefined : 440, height: 32, display: 'flex', alignItems: 'center', background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: THEME.radiusControl, padding: '0 10px', gap: 8, transition: 'border-color 150ms, box-shadow 150ms' }}>
          <SearchIcon />
          {isMobile && (
            <select value={chain} onChange={e => setChain(e.target.value)} aria-label="Chain" style={{ background: 'transparent', border: 'none', outline: 'none', color: CHAIN_TEXT_COLORS[chain] || THEME.text, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {CHAINS.map(c => <option key={c} value={c} style={{ background: THEME.surface, color: THEME.text }}>{c.toUpperCase()}</option>)}
            </select>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="Token name or contract address…" aria-label="Search token" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: THEME.text, fontSize: 12.5, minWidth: 0, fontFamily: 'inherit' }} />
          {isMobile && (
            <button onClick={doSearch} style={{ ...primaryBtn, height: 24, padding: '0 8px', fontSize: 11, flexShrink: 0 }}>{loading ? '...' : 'Go'}</button>
          )}
        </div>

        {/* Token identity + market data */}
        {view && !isMobile && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: `0 10px 0 ${view.logo ? 5 : 10}px`, border: `1px solid ${THEME.border}`, borderRadius: THEME.radiusControl, minWidth: 0, flexShrink: 1 }}>
              {view.logo && <img src={view.logo} alt="" style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />}
              <span style={{ fontSize: 12.5, fontWeight: 600, color: THEME.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{view.name || view.symbol}</span>
              {view.symbol && <span style={{ fontSize: 11.5, color: THEME.text2, whiteSpace: 'nowrap' }}>{view.symbol}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {fmtPrice(view.price)}{priceChange}
            </div>
            {cachedAt && (
              <button onClick={() => loadToken(view.address, { refresh: true, chainOverride: view.chain })} disabled={refreshing}
                title="Data age — click to recompute"
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: '6px 2px', cursor: refreshing ? 'wait' : 'pointer', color: THEME.text2, fontSize: 11.5, whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0 }}>
                {refreshing ? (
                  <><span className="bm-spin" style={{ display: 'inline-block' }}>⟳</span>updating…</>
                ) : `Updated ${fmtAge(cachedAt)}`}
              </button>
            )}
          </>
        )}

        <div style={{ flex: 1 }} className="nav-hide-mobile" />

        {view && !isMobile && (
          <button onClick={handleShare} title="Copy link" style={{ ...ghostBtn, color: shared ? THEME.up : THEME.text, flexShrink: 0 }}>
            {shared ? '✓ Copied' : 'Share'}
          </button>
        )}

        {/* Auth section */}
        {userEmail ? (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setShowUserMenu(!showUserMenu)} aria-haspopup="menu" aria-expanded={showUserMenu} aria-label={`Account: ${userEmail}`} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={dot(THEME.up, 6)} />
              <span className="nav-hide-mobile">{userEmail.length > 18 ? userEmail.slice(0, 16) + '...' : userEmail}</span>
              <span style={{ fontSize: 8, color: THEME.text2 }} aria-hidden="true">▼</span>
            </button>
            {showUserMenu && (
              <div role="menu" style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: THEME.surface,
                border: `1px solid ${THEME.borderStrong}`, borderRadius: THEME.radiusCard, padding: 6, minWidth: 220,
                boxShadow: THEME.shadowPopup, zIndex: 500,
              }}>
                <div style={{ padding: '8px 12px', fontSize: 11.5, color: THEME.text2, borderBottom: `1px solid ${THEME.border}`, marginBottom: 4, wordBreak: 'break-all' }}>
                  {userEmail}
                </div>
                <button role="menuitem" onClick={handleLogout} style={{
                  width: '100%', background: 'none', border: 'none', padding: '8px 12px', color: THEME.text, fontSize: 12.5,
                  cursor: 'pointer', textAlign: 'left', borderRadius: THEME.radiusControl, fontWeight: 500, fontFamily: 'inherit', transition: 'background-color 150ms',
                }} onMouseEnter={e => e.currentTarget.style.background = THEME.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            <button onClick={() => router.push('/login')} className="nav-hide-mobile" style={textBtn}>Log in</button>
            <button onClick={() => router.push('/signup')} className="nav-hide-mobile" style={primaryBtn}>Sign up</button>
          </div>
        )}

        {view && isMobile && (
          <button onClick={() => setShowList(true)} aria-label="Address list" style={{ ...ghostBtn, padding: '0 10px', flexShrink: 0 }}>☰</button>
        )}
      </nav>
      )}

      {/* Stats strip: one dense row under the top bar (replaces the floating pills).
          The stats scroll sideways on narrow screens; in embed mode the row also
          carries the token identity, and the Holders toggle sits OUTSIDE the
          scrolling region so it stays reachable in a narrow partner iframe. */}
      {view && (
        <div style={{ height: 40, boxSizing: 'border-box', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${THEME.border}`, background: THEME.surface, flexShrink: 0 }}>
        <div ref={stripRef} className="bm-app-strip" onScroll={updateStripFade} onWheel={handleStripWheel}
          style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', gap: 28, padding: '0 16px', fontSize: 12, overflowX: 'auto', whiteSpace: 'nowrap', scrollbarWidth: 'none' }}>
          {(isEmbed || isMobile) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, minWidth: 0 }}>
              {view.logo && <img src={view.logo} alt="" style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0 }} onError={e => (e.currentTarget.style.display = 'none')} />}
              <span style={{ fontSize: 12.5, fontWeight: 600, color: isEmbed ? accent : THEME.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{view.name || view.symbol}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: THEME.text, fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(view.price)}</span>
              {priceChange}
            </div>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: CHAIN_TEXT_COLORS[view.chain] || THEME.text2, flexShrink: 0 }}>
            <span style={dot(chainColor, 6)} />{CHAIN_LABEL[view.chain] || view.chain}
          </span>
          {stats.map(([l, v, tip]) => (
            <span key={l} title={tip} style={statLabel}>{l}<span style={statValue}>{v}</span></span>
          ))}
          {rugScore && (
            <button onClick={() => setShowRugDetails(v => !v)} title="Risk score — click for the breakdown" aria-expanded={showRugDetails}
              style={{ ...statLabel, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 'inherit' }}>
              Risk<span style={{ ...statValue, color: rugScore.color }}>{rugScore.score} · {rugScore.label}</span>
            </button>
          )}
        </div>
        {isEmbed && (
          <button onClick={() => setEmbedListOpen(v => !v)} aria-expanded={embedListOpen}
            style={{ ...ghostBtn, height: 28, padding: '0 10px', fontSize: 11.5, border: `1px solid ${accent}`, flexShrink: 0, marginRight: 16 }}>
            ☰ Holders
          </button>
        )}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0, background: THEME.mapBg }}>
          <canvas ref={canvasRef}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            onMouseLeave={() => { isDraggingRef.current = false; hoveredIdxRef.current = -1; if (hoveredAddrRef.current) { hoveredAddrRef.current = null; setHoveredAddr(null); } }}
            style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab', touchAction: 'none' }}
          />
          {!loading && building === null && !view && (
            <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', display: 'flex', justifyContent: 'center', background: THEME.bg }}>
              <div style={{ width: '100%', maxWidth: 680, padding: '36px 20px 60px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">🍌</div>
                  <div style={{ fontSize: 16, color: THEME.text, fontWeight: 700, marginTop: 10 }}>
                    {error || 'Explore token holder maps'}
                  </div>
                  <div style={{ fontSize: 12.5, color: THEME.text2, marginTop: 4 }}>
                    Search any token or paste a contract address
                  </div>
                  {/* The embed has no search bar, so an error needs its own way back */}
                  {isEmbed && error && urlToken && (
                    <button onClick={() => loadToken(urlToken, urlChain ? { chainOverride: urlChain } : undefined)}
                      style={{ ...primaryBtn, marginTop: 12, padding: '0 16px' }}>
                      ↻ Try again
                    </button>
                  )}
                </div>
                {!isEmbed && discover && discover.popular.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: THEME.text2, marginTop: 18 }}>Popular maps · instant</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8 }}>
                      {discover.popular.slice(0, 9).map(t => <TokenTile key={`${t.chain}:${t.address}`} t={t} onOpen={openDiscoverToken} />)}
                    </div>
                  </>
                )}
                {!isEmbed && discover && discover.trending.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: THEME.text2, marginTop: 16 }}>
                      Trending now <span style={{ fontWeight: 500 }}>· first map takes ~2 min to compute</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8 }}>
                      {discover.trending
                        .filter(t => !discover.popular.some(p => p.chain === t.chain && p.address === t.address))
                        .slice(0, 9)
                        .map(t => <TokenTile key={`${t.chain}:${t.address}`} t={t} onOpen={openDiscoverToken} />)}
                    </div>
                  </>
                )}
                <div style={{ fontSize: 11.5, color: THEME.text2, textAlign: 'center', marginTop: 18 }}>
                  {isMobile ? 'Pinch to zoom · Drag to pan' : 'Scroll to zoom · Drag to pan · Click a bubble for details'}
                  {!isEmbed && (
                    <>
                      {' · '}<a href="/terms" style={{ color: THEME.text2, textDecoration: 'underline', textDecorationColor: THEME.text3 }}>Terms</a>
                      {' · '}<a href="/privacy" style={{ color: THEME.text2, textDecoration: 'underline', textDecorationColor: THEME.text3 }}>Privacy</a>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: COVER }}>
              <div className="bm-spin" style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">🍌</div>
              <div style={{ fontSize: 13, color: THEME.text, fontWeight: 600 }}>Mapping holders & transfers...</div>
              <div style={{ fontSize: 11.5, color: THEME.text2 }}>First load computes the full graph — can take a minute</div>
            </div>
          )}
          {!loading && building !== null && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, background: COVER, padding: 20 }}>
              <div className="bm-spin" style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">🍌</div>
              <div style={{ fontSize: 14, color: THEME.text, fontWeight: 700 }}>Building this holder map</div>
              <div style={{ fontSize: 12, color: THEME.text2, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
                First-time maps take ~2 minutes to compute.<br />This view refreshes automatically — no need to reload.
              </div>
              <div style={{ fontSize: 11.5, color: THEME.text2, fontVariantNumeric: 'tabular-nums' }}>
                {fmtElapsed(Date.now() - building)} elapsed · checking every {Math.round(BUILD_POLL_MS / 1000)}s
              </div>
            </div>
          )}
          {error && view && (
            <div role="alert" style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: THEME.surface, border: `1px solid ${ERROR_BORDER}`, color: ERROR_TEXT, borderRadius: 8, padding: '8px 16px', fontSize: 12, zIndex: 150, display: 'flex', gap: 10, alignItems: 'center', maxWidth: 'calc(100% - 24px)' }}>
              {error}
              <button onClick={() => setError(null)} aria-label="Dismiss" style={{ ...closeBtn, fontSize: 14 }}>×</button>
            </div>
          )}
          {/* Risk breakdown: flat card anchored under the strip at the left */}
          {view && rugScore && showRugDetails && (
            <div style={{ position: 'absolute', top: 10, left: 12, width: 'calc(100% - 24px)', maxWidth: 380, background: THEME.surface, border: `1px solid ${THEME.borderStrong}`, borderRadius: THEME.radiusCard, padding: 14, zIndex: 120, boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>Risk analysis — <span style={{ color: rugScore.color, fontVariantNumeric: 'tabular-nums' }}>{rugScore.score}/100</span></div>
                <button onClick={() => setShowRugDetails(false)} aria-label="Close" style={closeBtn}>×</button>
              </div>
              {rugScore.factors.map(f => {
                const band = f.score >= 70 ? THEME.up : f.score >= 40 ? THEME.warn : THEME.down;
                return (
                  <div key={f.name} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: THEME.text, fontWeight: 600 }}>{f.name}</span>
                      <span style={{ fontSize: 12, color: band, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{f.score}/100</span>
                    </div>
                    <div style={{ height: 4, background: THEME.surface3, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${f.score}%`, background: band, borderRadius: 2, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: 11.5, color: THEME.text2, marginTop: 4, lineHeight: 1.4 }}>{f.detail}</div>
                  </div>
                );
              })}
              <div style={{ fontSize: 11.5, color: THEME.text2, marginTop: 10, lineHeight: 1.45 }}>This score is for informational purposes only and does not constitute financial advice. Always do your own research.</div>
            </div>
          )}
          {!isMobile && view && view.clusters.length > 0 && (
            <div style={{ position: 'absolute', bottom: isEmbed ? 52 : 14, left: 14, display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', borderRadius: 8, background: COVER, border: `1px solid ${THEME.border}`, fontSize: 11.5, maxHeight: 'calc(100% - 80px)', overflowY: 'auto' }}>
              {view.clusters.slice(0, legendOpen ? 30 : 6).map(c => {
                const col = clusterColor(c.id);
                const hid = c.members.every(i => hidden.has(view.nodes[i].address));
                return (
                  <button key={c.id}
                    onMouseEnter={() => highlightCluster(c.id)}
                    onMouseLeave={() => highlightCluster(null)}
                    onClick={() => { setExpanded(prev => new Set(prev).add(c.id)); const first = c.members[0]; if (first !== undefined) selectFromList(view.nodes[first].address); }}
                    title={`${c.members.length} wallets · click to locate`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: '2px 0', color: THEME.text, fontSize: 11.5, cursor: 'pointer', opacity: hid ? 0.45 : 1, fontFamily: 'inherit', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    <span style={dot(col, 8)} />
                    <span style={{ width: 64 }}>Cluster {c.id + 1}</span>
                    <span style={{ color: THEME.text2, fontVariantNumeric: 'tabular-nums' }}>{c.pct.toFixed(c.pct < 1 ? 2 : 1)}%</span>
                  </button>
                );
              })}
              {view.clusters.length > 6 && (
                <button onClick={() => setLegendOpen(v => !v)}
                  style={{ background: 'none', border: 'none', padding: '2px 0', color: THEME.text2, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  {legendOpen ? 'Show fewer' : `+${view.clusters.length - 6} more`}
                </button>
              )}
            </div>
          )}
          {/* "Powered by BananaMaps" badge — required on the free plan and for
              keyless first-party embeds; Partner-plan sites may turn it off. */}
          {isEmbed && showBadge && (
            <a href={`https://www.bananamaps.io/app?token=${encodeURIComponent(urlToken || '')}${urlChain ? `&chain=${encodeURIComponent(urlChain)}` : ''}`}
              target="_blank" rel="noopener noreferrer" title="Powered by BananaMaps"
              style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 5, background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: THEME.radiusControl, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, color: THEME.text, textDecoration: 'none', zIndex: 150 }}>
              🍌 Banana<span style={{ color: accent }}>Maps</span>
              <span style={{ color: THEME.text2, fontWeight: 500 }}>· Open full map ↗</span>
            </a>
          )}
          {isEmbed && embedListOpen && view && (
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 300, maxWidth: '100%', background: THEME.surface, borderLeft: `1px solid ${THEME.border}`, zIndex: 160, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px 0' }}>
                <button onClick={() => setEmbedListOpen(false)} aria-label="Close" style={{ ...closeBtn, width: 24, height: 24, fontSize: 16 }}>×</button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <AddressList
                  graph={view}
                  {...addressListShared}
                  onSelect={selectFromList}
                  onHoverAddr={addr => { hoveredIdxRef.current = addr !== null ? (addrToIdx.get(addr) ?? -1) : -1; }}
                />
              </div>
            </div>
          )}
          {view && (
            <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'flex', flexDirection: 'column', border: `1px solid ${THEME.border}`, borderRadius: THEME.radiusControl, overflow: 'hidden' }}>
              {([['+', 1.2, 'Zoom in'], ['−', 0.8, 'Zoom out'], ['⊙', 0, 'Fit map']] as [string, number, string][]).map(([l, f, label], i) => (
                <button key={label} aria-label={label} title={label} onClick={() => {
                  if (f === 0) { userTouchedViewRef.current = false; autoFit(); return; }
                  // Zoom about the canvas center, like the wheel handler does about the cursor
                  userTouchedViewRef.current = true;
                  const { w, h } = sizeRef.current;
                  const ns = Math.min(Math.max(scaleRef.current * f, 0.05), 8);
                  offsetRef.current.x = w / 2 - (w / 2 - offsetRef.current.x) * (ns / scaleRef.current);
                  offsetRef.current.y = h / 2 - (h / 2 - offsetRef.current.y) * (ns / scaleRef.current);
                  scaleRef.current = ns;
                }} style={{ width: 32, height: 32, background: THEME.surface, border: 'none', borderBottom: i < 2 ? `1px solid ${THEME.border}` : 'none', color: THEME.text, fontSize: f === 0 ? 13 : 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'inherit' }}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div style={getPopupStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 11.5, color: THEME.text2 }}>
                  <span style={dot(selected.cluster !== undefined ? clusterColor(selected.cluster) : UNCLUSTERED_DOT, 8)} />
                  <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {selected.rank !== undefined ? `Rank ${selected.rank}` : 'counterparty'}
                    {selected.cluster !== undefined && ` · Cluster ${selected.cluster + 1}`}
                  </span>
                  {selected.labelType && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: TYPE_COLORS[selected.labelType], border: `1px solid ${hexA(TYPE_COLORS[selected.labelType], 0.4)}`, borderRadius: 4, padding: '0 5px', lineHeight: '16px', flexShrink: 0 }}>
                      <TypeIcon type={selected.labelType} size={10} />{TYPE_META[selected.labelType].text}
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedAddr(null)} aria-label="Close" style={closeBtn}>×</button>
              </div>
              {selected.label && <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.label}</div>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span title={selected.address} style={{ fontFamily: THEME.fontMono, fontSize: 13, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortAddr(selected.address, 10, 8)}</span>
                <button onClick={() => { navigator.clipboard?.writeText(selected.address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); }}
                  title="Copy address" aria-label="Copy address"
                  style={{ background: THEME.bg, border: `1px solid ${THEME.borderStrong}`, borderRadius: 5, padding: '2px 8px', color: copied ? THEME.up : THEME.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${THEME.border}` }}>
                {([
                  ['Share of supply', selected.pct ? fmtPct(selected.pct) : '—', THEME.text],
                  ['Balance', selected.balanceFormatted ? `${fBalance(selected.balanceFormatted)}${view?.symbol ? ` ${view.symbol}` : ''}` : '—', THEME.text],
                  // USD is always balance × the snapshot price shown in the header, never a
                  // provider's stored figure: Vybe priced positions ~26% off our displayed
                  // price, and worker deltas move balances without touching stored USD.
                  [view?.price ? `Value at ${fmtPrice(view.price)}` : 'Value', (() => { const usd = selected.balanceFormatted && view?.price ? selected.balanceFormatted * view.price : (selected.usdValue || 0); return usd ? fUSDFull(usd) : '—'; })(), THEME.up],
                ] as [string, string, string][]).map(([l, v, c], i, arr) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${THEME.border}` : 'none', fontSize: 12.5 }}>
                    <span style={{ color: THEME.text2, whiteSpace: 'nowrap' }}>{l}</span>
                    <span style={{ fontWeight: 600, color: c, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                  </div>
                ))}
              </div>
              {cachedAt && (
                <div style={{ fontSize: 11.5, color: THEME.text2, marginTop: -4 }}>
                  Balance as of {fmtAge(cachedAt)}{view?.price ? ` · at ${fmtPrice(view.price)}` : ''}
                </div>
              )}
              {connections.length > 0 && (
                <div>
                  <div style={{ fontSize: 11.5, color: THEME.text2, fontWeight: 600, marginBottom: 4 }}>
                    Transfers with {connections.length} wallet{connections.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ maxHeight: 6 * 26, overflowY: 'auto' }}>
                    {connections.slice(0, 12).map(c => (
                      <div key={c.node.address}
                        onClick={c.drawn ? () => selectFromList(c.node.address) : undefined}
                        title={c.drawn ? undefined : 'Not drawn on the map'}
                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 6px', borderRadius: 5, cursor: c.drawn ? 'pointer' : 'default', fontSize: 12, height: 26, opacity: c.drawn ? 1 : 0.55, transition: 'background-color 150ms' }}
                        onMouseEnter={c.drawn ? e => (e.currentTarget.style.background = THEME.surface2) : undefined}
                        onMouseLeave={c.drawn ? e => (e.currentTarget.style.background = 'none') : undefined}>
                        <span style={dot(c.cluster !== undefined ? clusterColor(c.cluster) : UNCLUSTERED_DOT, 7)} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: c.node.label ? 'inherit' : THEME.fontMono, fontWeight: c.node.label ? 600 : 400, color: THEME.text }}>
                          {c.node.label || shortAddr(c.node.address)}
                        </span>
                        <span style={{ color: THEME.text2, flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                          {c.out > 0 && c.in > 0 ? '⇄' : c.out > 0 ? '→' : '←'} {c.total}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => window.open(explorerHolderUrl(view?.chain || 'eth', view?.address || '', selected.address), '_blank')} style={{ ...ghostBtn, width: '100%', height: 'auto', padding: 7, textAlign: 'center' }}>
                View this holding on Explorer ↗
              </button>
            </div>
          )}
        </div>

        {!isMobile && !isEmbed && (
          <div style={{ width: 320, borderLeft: `1px solid ${THEME.border}`, background: THEME.surface, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {view ? (
              <AddressList
                graph={view}
                {...addressListShared}
                hoveredAddr={hoveredAddr}
                onSelect={selectFromList}
                onHoverAddr={addr => { hoveredIdxRef.current = addr !== null ? (addrToIdx.get(addr) ?? -1) : -1; }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: THEME.text3, fontSize: 13 }}>
                Select a token
              </div>
            )}
          </div>
        )}

        {isMobile && showList && view && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowList(false)} />
            <div style={{ background: THEME.surface, borderRadius: '14px 14px 0 0', borderTop: `1px solid ${THEME.border}`, height: '70vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowList(false)} aria-label="Close" style={{ ...closeBtn, width: 26, height: 26, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <AddressList
                  graph={view}
                  {...addressListShared}
                  onSelect={addr => { selectFromList(addr); setShowList(false); }}
                  onHoverAddr={() => {}}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .bm-spin{animation:spin 1s linear infinite}
        .bm-app-strip{--fade-l:0px;--fade-r:0px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 var(--fade-l),#000 calc(100% - var(--fade-r)),transparent);mask-image:linear-gradient(90deg,transparent,#000 var(--fade-l),#000 calc(100% - var(--fade-r)),transparent)}
        .bm-app-strip::-webkit-scrollbar{display:none}
        .bm-app-search:focus-within{border-color:var(--banana);box-shadow:0 0 0 3px rgba(245,200,66,0.25)}
        @media (prefers-reduced-motion: reduce){.bm-spin{animation:none}.bm-app-search{transition:none}}
      `}</style>
    </div>
  );
}

export default function AppClient({ embed = false, embedOptions }: { embed?: boolean; embedOptions?: EmbedOptions }) {
  return <Suspense><AppContent embed={embed} embedOptions={embedOptions} /></Suspense>;
}
