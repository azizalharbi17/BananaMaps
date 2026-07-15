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

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2.4" />}
    </svg>
  );
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

const TYPE_BADGE: Record<string, { text: string; color: string }> = {
  cex: { text: 'CEX', color: '#627EEA' },
  dex: { text: 'DEX', color: '#9945FF' },
  burn: { text: 'Burn', color: '#EF4444' },
  contract: { text: 'Contract', color: '#8B8FA3' },
};

interface Props {
  graph: TokenGraph;
  hidden: Set<string>;
  toggleHidden: (addrs: string[]) => void;
  selectedAddr: string | null;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid rgba(245,200,66,0.08)' }}>
        <div style={{ fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(245,200,66,0.35)', marginBottom: 8 }}>
          Address List
        </div>
        <input
          value={p.query}
          onChange={e => p.setQuery(e.target.value)}
          placeholder="Search addresses"
          style={{ width: '100%', background: 'rgba(245,200,66,0.04)', border: '1px solid rgba(245,200,66,0.12)', borderRadius: 6, padding: '6px 8px', color: '#f5f0e8', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 10, color: 'rgba(245,235,200,0.55)', userSelect: 'none' }}>
          <input type="checkbox" checked={p.ungroup} onChange={e => p.setUngroup(e.target.checked)} style={{ accentColor: '#F5C842', width: 12, height: 12 }} />
          Ungroup clusters
        </label>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {rows.map((it, i) => {
          if (it.type === 'cluster') {
            const color = clusterColor(it.id);
            const hid = clusterHidden(it.id);
            const members = graph.clusters.find(c => c.id === it.id)?.members || [];
            return (
              <div key={`c${it.id}`}
                onClick={() => p.toggleExpanded(it.id)}
                style={{ padding: '8px 12px', borderBottom: '1px solid rgba(245,200,66,0.05)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', opacity: hid ? 0.45 : 1 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}66` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#f0ead8', fontWeight: 700 }}>
                    Cluster {it.id + 1} <span style={{ color: 'rgba(245,235,200,0.4)', fontWeight: 500 }}>({it.size})</span>
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(200,180,100,0.45)', marginTop: 1 }}>{it.pct.toFixed(2)}% of supply</div>
                </div>
                <span style={{ fontSize: 8, color: 'rgba(245,235,200,0.35)' }}>{p.expanded.has(it.id) ? '▼' : '▶'}</span>
                <button
                  onClick={e => { e.stopPropagation(); p.toggleHidden(members.map(m => graph.nodes[m].address)); }}
                  title={hid ? 'Show cluster' : 'Hide cluster'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: hid ? 'rgba(239,68,68,0.7)' : 'rgba(245,235,200,0.35)', padding: 2, display: 'flex' }}>
                  <EyeIcon off={hid} />
                </button>
              </div>
            );
          }
          const n = it.node;
          const hid = p.hidden.has(n.address);
          const isSel = p.selectedAddr === n.address;
          const badge = n.labelType ? TYPE_BADGE[n.labelType] : null;
          const color = n.cluster !== undefined ? clusterColor(n.cluster) : undefined;
          return (
            <div key={`${n.address}${it.sub ? '-s' : ''}`}
              onClick={() => p.onSelect(isSel ? null : n.address)}
              onMouseEnter={() => p.onHoverAddr(n.address)}
              onMouseLeave={() => p.onHoverAddr(null)}
              data-addr-row={n.address}
              style={{
                padding: it.sub ? '6px 12px 6px 28px' : '7px 12px',
                borderBottom: '1px solid rgba(245,200,66,0.04)',
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                background: isSel ? 'rgba(245,200,66,0.08)' : 'transparent',
                opacity: hid ? 0.4 : 1,
              }}>
              {n.rank !== undefined ? (
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  background: color ? color + '22' : 'rgba(245,200,66,0.06)',
                  border: `1.5px solid ${color || (badge ? badge.color + '88' : 'rgba(245,200,66,0.25)')}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 700, color: color || 'rgba(180,190,220,0.7)',
                }}>{n.rank}</div>
              ) : (
                <div style={{ width: 20, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color || 'rgba(120,134,175,0.5)' }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: badge ? '#B8BCC8' : 'rgba(245,235,200,0.75)', fontFamily: 'DM Mono,monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: n.label ? 700 : 400 }}>
                  {n.label || shortAddr(n.address)}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(200,180,100,0.35)', marginTop: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {badge && <span style={{ color: badge.color, fontSize: 8, background: badge.color + '18', padding: '0 4px', borderRadius: 3 }}>{badge.text}</span>}
                  <span>{n.pct > 0 ? n.pct.toFixed(n.pct < 0.01 ? 4 : 2) + '%' : n.kind === 'counterparty' ? 'counterparty' : '0%'}</span>
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); p.toggleHidden([n.address]); }}
                title={hid ? 'Show on map' : 'Hide from map'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: hid ? 'rgba(239,68,68,0.7)' : 'rgba(245,235,200,0.3)', padding: 2, display: 'flex', flexShrink: 0 }}>
                <EyeIcon off={hid} />
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>No matches</div>
        )}
      </div>
    </div>
  );
}

export { EXPLORER };
