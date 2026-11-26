'use client';
import { useMemo } from 'react';
import { TokenGraph, GraphNode } from '@/lib/graphTypes';
import { clusterColor } from '@/lib/mapEngine';

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
  cex: { text: 'CEX', color: '#7B8CFF' },
  dex: { text: 'DEX', color: '#B388FF' },
  burn: { text: 'Burn', color: '#FF6B6B' },
  contract: { text: 'Contract', color: '#A3A8B8' },
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

// Theme tokens for the list (kept local: the app screen uses literal colors throughout)
const T = {
  text: '#F3EEE2',
  textDim: 'rgba(243,238,226,0.62)',
  textMute: 'rgba(243,238,226,0.38)',
  gold: '#F5C842',
  goldDim: 'rgba(245,200,66,0.55)',
  line: 'rgba(245,200,66,0.07)',
  hover: 'rgba(245,200,66,0.06)',
  selected: 'rgba(245,200,66,0.12)',
};
// Interface text (labels, counts, percentages) uses the site's primary face;
// DM Mono is reserved for the raw wallet addresses.
const SANS = "'Bricolage Grotesque', sans-serif";

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

  return (
    <div className="al-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: '1.6px', textTransform: 'uppercase', color: T.goldDim, fontWeight: 700 }}>Address list</div>
          <div style={{ fontSize: 12, color: T.textDim, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>top {holderTotal}</div>
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textMute, fontSize: 14, pointerEvents: 'none' }}>⌕</span>
          <input
            value={p.query}
            onChange={e => p.setQuery(e.target.value)}
            placeholder="Search address or label"
            spellCheck={false}
            style={{ width: '100%', background: 'rgba(245,200,66,0.05)', border: '1px solid rgba(245,200,66,0.16)', borderRadius: 8, padding: '8px 10px 8px 30px', color: T.text, fontSize: 13, fontFamily: SANS, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontSize: 12, color: T.textDim, userSelect: 'none' }}>
          <input type="checkbox" checked={p.ungroup} onChange={e => p.setUngroup(e.target.checked)} style={{ accentColor: T.gold, width: 14, height: 14, margin: 0 }} />
          Ungroup clusters
        </label>
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
                  display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 0 14px', minHeight: 44, cursor: 'pointer',
                  borderBottom: `1px solid ${T.line}`, opacity: hid ? 0.45 : 1,
                  background: open ? 'rgba(255,255,255,0.025)' : 'transparent',
                }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}80` }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 13, color: T.text, fontWeight: 700, whiteSpace: 'nowrap' }}>Cluster {it.id + 1}</span>
                  <span style={{ fontSize: 12, color: T.textDim, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>({it.size})</span>
                </div>
                <span style={{ fontSize: 12.5, color: color, fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontWeight: 600, flexShrink: 0 }}>{fmtPct(it.pct)}</span>
                <span style={{ width: 16, textAlign: 'center', fontSize: 10, color: T.textMute, flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                <button
                  className="al-eye"
                  onClick={e => { e.stopPropagation(); p.toggleHidden(members.map(m => graph.nodes[m].address)); }}
                  title={hid ? 'Show cluster on map' : 'Hide cluster from map'}
                  aria-label={hid ? 'Show cluster' : 'Hide cluster'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: hid ? '#FF6B6B' : T.textMute, padding: 4, display: 'flex', flexShrink: 0, borderRadius: 6 }}>
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
          return (
            <div key={`${n.address}${it.sub ? '-s' : ''}`}
              className="al-row"
              onClick={() => p.onSelect(isSel ? null : n.address)}
              onMouseEnter={() => p.onHoverAddr(n.address)}
              onMouseLeave={() => p.onHoverAddr(null)}
              data-addr-row={n.address}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, minHeight: it.sub ? 38 : 44,
                padding: it.sub ? '0 10px 0 14px' : '0 10px 0 14px',
                borderBottom: `1px solid ${T.line}`, cursor: 'pointer',
                background: isSel ? T.selected : isHov ? T.hover : 'transparent',
                boxShadow: it.sub && color ? `inset 3px 0 0 ${color}` : isSel ? 'inset 3px 0 0 #F5C842' : 'none',
                opacity: hid ? 0.42 : 1,
              }}>
              {/* rank / cluster marker */}
              {n.rank !== undefined ? (
                <span style={{
                  width: 30, flexShrink: 0, textAlign: 'right', fontSize: 11.5, fontWeight: 700, fontFamily: SANS, fontVariantNumeric: 'tabular-nums',
                  color: color || (meta ? meta.color : T.textDim),
                }}>#{n.rank}</span>
              ) : (
                <span style={{ width: 30, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color || T.textMute }} />
                </span>
              )}
              {/* name / address */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                {meta && (
                  <span title={meta.text} style={{ color: meta.color, display: 'flex', flexShrink: 0, opacity: 0.95 }}>
                    <TypeIcon type={n.labelType!} />
                  </span>
                )}
                {n.label ? (
                  <span style={{ fontSize: 13, fontWeight: 650, color: hid ? T.textDim : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.label}
                  </span>
                ) : (
                  <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: T.text, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>
                    {shortAddr(n.address)}
                  </span>
                )}
              </div>
              {/* supply share */}
              <span style={{ fontSize: 12.5, fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: n.pct > 0 ? T.textDim : T.textMute, flexShrink: 0, minWidth: 54, textAlign: 'right' }}>
                {pctText}
              </span>
              <button
                className="al-eye"
                onClick={e => { e.stopPropagation(); p.toggleHidden([n.address]); }}
                title={hid ? 'Show on map' : 'Hide from map'}
                aria-label={hid ? 'Show on map' : 'Hide from map'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: hid ? '#FF6B6B' : T.textMute, padding: 4, display: 'flex', flexShrink: 0, borderRadius: 6 }}>
                <EyeIcon off={hid} />
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.textMute }}>No matches</div>
        )}
      </div>
      <style>{`
        .al-row:hover { background: ${T.hover} !important; }
        .al-eye:hover { background: rgba(245,200,66,0.12); color: #F5C842 !important; }
        .al-root input::placeholder { color: rgba(243,238,226,0.35); }
      `}</style>
    </div>
  );
}

export { EXPLORER };
