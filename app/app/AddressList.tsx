'use client';
import { useMemo, type CSSProperties } from 'react';
import { TokenGraph, GraphNode } from '@/lib/graphTypes';
import { clusterColor } from '@/lib/mapEngine';
import { THEME, TYPE_COLORS, hexA } from '@/lib/theme';

const EXPLORER: Record<string, string> = {
  sol: 'https://solscan.io/account',
  bsc: 'https://bscscan.com/address',
  base: 'https://basescan.org/address',
  eth: 'https://etherscan.io/address',
  robinhood: 'https://robinhoodchain.blockscout.com/address',
};

/**
 * Explorer page for THIS wallet's holding of THIS token — the number our popup
 * shows. The generic address page headlines the wallet's total net worth across
 * every asset, which is why "the value didn't match" when people compared them.
 */
export function explorerHolderUrl(chain: string, token: string, wallet: string): string {
  switch (chain) {
    case 'eth': return `https://etherscan.io/token/${token}?a=${wallet}`;
    case 'bsc': return `https://bscscan.com/token/${token}?a=${wallet}`;
    case 'base': return `https://basescan.org/token/${token}?a=${wallet}`;
    case 'robinhood': return `https://robinhoodchain.blockscout.com/token/${token}?a=${wallet}`;
    case 'sol': return `https://solscan.io/account/${wallet}#portfolio`;
    default: return `${EXPLORER[chain] || EXPLORER.eth}/${wallet}`;
  }
}

export function EyeIcon({ off, size = 16 }: { off: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2.4" />}
    </svg>
  );
}

/** Small monochrome glyphs for labeled entity types (tinted by TYPE_META.color). */
export function TypeIcon({ type, size = 12 }: { type: NonNullable<GraphNode['labelType']>; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'cex': // bank / exchange building
      return <svg {...common}><path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18M12 3l9 7H3l9-7z" /></svg>;
    case 'dex': // swap arrows
      return <svg {...common}><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>;
    case 'burn': // flame
      return <svg {...common}><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z" /></svg>;
    default: // contract: code braces
      return <svg {...common}><path d="M8 4c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3M16 4c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3" /></svg>;
  }
}

export const TYPE_META: Record<NonNullable<GraphNode['labelType']>, { text: string; color: string }> = {
  cex: { text: 'CEX', color: TYPE_COLORS.cex },
  dex: { text: 'DEX', color: TYPE_COLORS.dex },
  burn: { text: 'Burn', color: TYPE_COLORS.burn },
  contract: { text: 'Contract', color: TYPE_COLORS.contract },
};

export function shortAddr(a: string, head = 6, tail = 4) {
  return a.length > head + tail + 3 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;
}

export function fmtPct(pct: number): string {
  if (pct <= 0) return '0%';
  if (pct < 0.01) return '<0.01%';
  return pct.toFixed(2) + '%';
}

interface Props {
  graph: TokenGraph;
  hidden: Set<string>;
  toggleHidden: (addrs: string[]) => void;
  selectedAddr: string | null;
  hoveredAddr?: string | null;
  onSelect: (addr: string | null) => void;
  onHoverAddr: (addr: string | null) => void;
  query: string;
  setQuery: (q: string) => void;
  ungroup: boolean;
  setUngroup: (v: boolean) => void;
  expanded: Set<number>;
  toggleExpanded: (id: number) => void;
}

type RowItem =
  | { type: 'cluster'; id: number; size: number; pct: number }
  | { type: 'addr'; node: GraphNode; sub?: boolean };

// Table metrics (Theme B §4): rank column, supply column and the trailing eye
// control share one grid so the "# / WALLET / SUPPLY" header lines up with rows.
const RANK_W = 34;
const PCT_W = 56;
const EYE_W = 24;
const ROW_GAP = 8;
const SIDE_PAD = 14;

// The name cell of every row is a real <button> so keyboard and switch users
// can expand a cluster / select a wallet: Enter or Space fires a click that
// bubbles to the row's onClick (the button itself has no handler, so nothing
// toggles twice). Reset to look exactly like the plain cell it replaces.
const rowBtn: CSSProperties = {
  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', height: '100%',
  background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', color: 'inherit',
  textAlign: 'left', cursor: 'pointer',
};

export default function AddressList(p: Props) {
  const { graph } = p;

  const rows = useMemo<RowItem[]>(() => {
    const q = p.query.trim().toLowerCase();
    if (q) {
      // Search mode: flat list of matches (address or label)
      return graph.nodes
        .filter(n => n.address.toLowerCase().includes(q) || (n.label || '').toLowerCase().includes(q))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 100)
        .map(n => ({ type: 'addr' as const, node: n }));
    }
    const holders = graph.nodes.filter(n => n.kind === 'holder');
    if (p.ungroup) {
      return holders
        .sort((a, b) => (a.rank || 999) - (b.rank || 999))
        .map(n => ({ type: 'addr' as const, node: n }));
    }
    // Grouped: cluster rows + unclustered holders, interleaved by % of supply
    const items: RowItem[] = [];
    for (const c of graph.clusters) items.push({ type: 'cluster', id: c.id, size: c.members.length, pct: c.pct });
    for (const n of holders) if (n.cluster === undefined) items.push({ type: 'addr', node: n });
    items.sort((a, b) => {
      const pa = a.type === 'cluster' ? a.pct : a.node.pct;
      const pb = b.type === 'cluster' ? b.pct : b.node.pct;
      return pb - pa;
    });
    // Inject expanded cluster members as sub-rows
    const out: RowItem[] = [];
    for (const it of items) {
      out.push(it);
      if (it.type === 'cluster' && p.expanded.has(it.id)) {
        const members = graph.clusters.find(c => c.id === it.id)?.members || [];
        const nodes = members.map(i => graph.nodes[i]).sort((a, b) => b.pct - a.pct || (b.degree - a.degree));
        for (const n of nodes) out.push({ type: 'addr', node: n, sub: true });
      }
    }
    return out;
  }, [graph, p.query, p.ungroup, p.expanded]);

  const clusterHidden = (id: number) => {
    const members = graph.clusters.find(c => c.id === id)?.members || [];
    return members.length > 0 && members.every(i => p.hidden.has(graph.nodes[i].address));
  };

  const holderTotal = graph.nodes.filter(n => n.kind === 'holder').length;

  const pctStyle = (muted: boolean): CSSProperties => ({
    minWidth: PCT_W, flexShrink: 0, textAlign: 'right',
    fontSize: 12, fontVariantNumeric: 'tabular-nums', color: muted ? THEME.text3 : THEME.text,
  });

  return (
    <div className="al-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: THEME.text }}>
      {/* Header: title, search, ungroup */}
      <div style={{ padding: `12px ${SIDE_PAD}px 8px`, display: 'flex', flexDirection: 'column', gap: 8, borderBottom: `1px solid ${THEME.border}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text }}>Address list</span>
          <span style={{ fontSize: 11.5, color: THEME.text2, fontVariantNumeric: 'tabular-nums' }}>Top {holderTotal} holders</span>
        </div>
        <label
          className="al-search"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 9px', boxSizing: 'border-box',
            borderRadius: THEME.radiusControl, background: THEME.bg, border: `1px solid ${THEME.border}`,
            transition: 'border-color 150ms, box-shadow 150ms',
          }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={THEME.text2} strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={p.query}
            onChange={e => p.setQuery(e.target.value)}
            placeholder="Search address or label"
            aria-label="Search address or label"
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: THEME.text, fontSize: 12, fontFamily: 'inherit', padding: 0 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: THEME.text2, userSelect: 'none' }}>
          <input type="checkbox" checked={p.ungroup} onChange={e => p.setUngroup(e.target.checked)} style={{ accentColor: THEME.accent, width: 13, height: 13, margin: 0 }} />
          Ungroup clusters
        </label>
      </div>

      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: ROW_GAP, height: 28, flexShrink: 0, padding: `0 ${SIDE_PAD}px`,
        fontSize: 10.5, letterSpacing: '0.6px', color: THEME.text2, borderBottom: `1px solid ${THEME.border}`,
      }}>
        <span style={{ width: RANK_W, flexShrink: 0 }}>#</span>
        <span style={{ flex: 1, minWidth: 0 }}>WALLET</span>
        <span style={{ minWidth: PCT_W, flexShrink: 0, textAlign: 'right' }}>SUPPLY</span>
        <span style={{ width: EYE_W, flexShrink: 0 }} aria-hidden="true" />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {rows.map(it => {
          if (it.type === 'cluster') {
            const color = clusterColor(it.id);
            const hid = clusterHidden(it.id);
            const open = p.expanded.has(it.id);
            const members = graph.clusters.find(c => c.id === it.id)?.members || [];
            return (
              <div key={`c${it.id}`}
                className="al-row"
                onClick={() => p.toggleExpanded(it.id)}
                onMouseEnter={() => p.onHoverAddr(graph.nodes[members[0]]?.address ?? null)}
                onMouseLeave={() => p.onHoverAddr(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: ROW_GAP, height: 36, flexShrink: 0, padding: `0 ${SIDE_PAD}px`, cursor: 'pointer',
                  borderBottom: `1px solid ${THEME.divider}`, opacity: hid ? 0.45 : 1, background: 'transparent',
                }}>
                <span style={{ width: RANK_W, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                </span>
                <button type="button" className="al-rowbtn" aria-expanded={open}
                  onFocus={() => p.onHoverAddr(graph.nodes[members[0]]?.address ?? null)}
                  onBlur={() => p.onHoverAddr(null)}
                  style={{ ...rowBtn, gap: 4, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <span style={{ fontWeight: 700, color: THEME.text }}>Cluster {it.id + 1}</span>
                  <span style={{ color: THEME.text2, fontWeight: 400, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {it.size} wallet{it.size === 1 ? '' : 's'}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={THEME.text3} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    style={{ flexShrink: 0, marginLeft: 2, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>
                <span style={pctStyle(false)}>{fmtPct(it.pct)}</span>
                <button
                  className={`al-eye${hid ? ' al-eye-off' : ''}`}
                  onClick={e => { e.stopPropagation(); p.toggleHidden(members.map(m => graph.nodes[m].address)); }}
                  title={hid ? 'Show cluster on map' : 'Hide cluster from map'}
                  aria-label={hid ? 'Show cluster' : 'Hide cluster'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, width: EYE_W, height: EYE_W, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 4 }}>
                  <EyeIcon off={hid} />
                </button>
              </div>
            );
          }
          const n = it.node;
          const hid = p.hidden.has(n.address);
          const isSel = p.selectedAddr === n.address;
          const isHov = !isSel && p.hoveredAddr === n.address;
          const meta = n.labelType ? TYPE_META[n.labelType] : null;
          const color = n.cluster !== undefined ? clusterColor(n.cluster) : undefined;
          const pctText = n.pct > 0 ? fmtPct(n.pct) : n.kind === 'counterparty' ? '' : '0%';
          // Selected wins over the sub-row's cluster bar: the accent marks the active row.
          const leftBar = isSel ? `inset 2px 0 0 ${THEME.accent}` : it.sub && color ? `inset 2px 0 0 ${color}` : 'none';
          return (
            <div key={`${n.address}${it.sub ? '-s' : ''}`}
              className="al-row"
              onClick={() => p.onSelect(isSel ? null : n.address)}
              onMouseEnter={() => p.onHoverAddr(n.address)}
              onMouseLeave={() => p.onHoverAddr(null)}
              data-addr-row={n.address}
              style={{
                display: 'flex', alignItems: 'center', gap: ROW_GAP, height: it.sub ? 34 : 36, flexShrink: 0,
                padding: `0 ${SIDE_PAD}px`, cursor: 'pointer',
                borderBottom: `1px solid ${THEME.divider}`,
                background: isSel || isHov ? THEME.surface2 : 'transparent',
                boxShadow: leftBar,
                opacity: hid ? 0.45 : 1,
              }}>
              {/* rank / cluster marker */}
              {n.rank !== undefined ? (
                <span style={{ width: RANK_W, flexShrink: 0, fontSize: 11.5, color: THEME.text2, fontVariantNumeric: 'tabular-nums' }}>{n.rank}</span>
              ) : (
                <span style={{ width: RANK_W, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color || THEME.text3 }} />
                </span>
              )}
              {/* name / address — toggles selection (aria-pressed) */}
              <button type="button" className="al-rowbtn" aria-pressed={isSel}
                onFocus={() => p.onHoverAddr(n.address)}
                onBlur={() => p.onHoverAddr(null)}
                style={{ ...rowBtn, gap: 6 }}>
                {n.label ? (
                  <>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.label}
                    </span>
                    {meta && (
                      <span title={meta.text} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, height: 16, boxSizing: 'border-box',
                        padding: '0 4px', fontSize: 10.5, lineHeight: 1, color: THEME.text2,
                        border: `1px solid ${THEME.borderStrong}`, borderRadius: 4, whiteSpace: 'nowrap',
                      }}>
                        <span style={{ color: meta.color, display: 'flex' }}><TypeIcon type={n.labelType!} size={10} /></span>
                        {meta.text}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 12.5, fontFamily: THEME.fontMono, color: THEME.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {shortAddr(n.address)}
                  </span>
                )}
              </button>
              {/* supply share */}
              <span style={pctStyle(!(n.pct > 0))}>{pctText}</span>
              <button
                className={`al-eye${hid ? ' al-eye-off' : ''}`}
                onClick={e => { e.stopPropagation(); p.toggleHidden([n.address]); }}
                title={hid ? 'Show on map' : 'Hide from map'}
                aria-label={hid ? 'Show on map' : 'Hide from map'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, width: EYE_W, height: EYE_W, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 4 }}>
                <EyeIcon off={hid} />
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: THEME.text3 }}>No matches</div>
        )}
      </div>
      <style>{`
        .al-row { transition: background-color 150ms; }
        .al-row:hover { background: ${THEME.surface2} !important; }
        .al-rowbtn:focus-visible { outline: 2px solid ${THEME.accent}; outline-offset: -2px; border-radius: 4px; }
        .al-eye { color: ${THEME.text3}; transition: color 150ms; }
        .al-eye:hover { color: ${THEME.text}; }
        .al-eye-off, .al-eye-off:hover { color: ${THEME.down}; }
        .al-search:focus-within { border-color: ${THEME.accent} !important; box-shadow: 0 0 0 3px ${hexA(THEME.accent, 0.25)}; }
        .al-root input::placeholder { color: ${THEME.text3}; }
      `}</style>
    </div>
  );
}

export { EXPLORER };
