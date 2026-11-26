import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { lookupCachedGraphForToken } from '@/lib/tokenLookup';
import { THEME } from '@/lib/theme';
import { CLUSTER_COLORS } from '@/lib/mapEngine';
import { toViewGraph } from '@/lib/graphView';

export const dynamic = 'force-dynamic';

const CHAIN_LABEL: Record<string, string> = { eth: 'Ethereum', bsc: 'BSC', sol: 'Solana', base: 'Base', robinhood: 'Robinhood Chain' };

// ImageResponse (Satori) cannot read CSS custom properties, so the theme tokens
// are used as literal values here. Keep these in step with lib/theme.ts.
const BG = THEME.bg;            // '#0F1115'
const SURFACE = THEME.surface;  // '#13161C'
const BORDER = THEME.border;    // '#23272F'
const TEXT = THEME.text;        // '#F2F4F7'
const TEXT2 = THEME.text2;      // '#9096A3'
const ACCENT = THEME.accent;    // '#F5C842'

function fmtPrice(p: number): string {
  if (!p) return '';
  if (p >= 1) return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  const m = p.toFixed(20).match(/^0\.(0*)([1-9]\d{0,2})/);
  return m ? `$0.${m[1]}${m[2]}` : '$' + p.toPrecision(3);
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const token = params.get('token') || '';
  const g = token ? await lookupCachedGraphForToken(token, params.get('chain')).catch(() => null) : null;

  const name = g?.name || token || 'Token holder maps';
  const symbol = g?.symbol && g.symbol !== g.name ? g.symbol : '';
  const price = g ? fmtPrice(g.price) : '';
  const change = g?.priceChange24h || 0;
  const top10 = g ? Math.round(g.nodes.filter(n => n.kind === 'holder' && (n.rank || 999) <= 10).reduce((s, n) => s + n.pct, 0)) : 0;
  // Visual v2: the cluster count shown anywhere is the count of clusters that are DRAWN.
  const clusterCount = g ? toViewGraph(g).clusters.length : 0;

  // Decorative bubble field on the right — echoes the v2 map bubbles
  // (translucent fill in the cluster color + a thin rim of the same color).
  const bubbles = [
    { x: 780, y: 110, r: 72, c: 0 }, { x: 905, y: 205, r: 44, c: 0 }, { x: 848, y: 320, r: 30, c: 0 },
    { x: 1035, y: 130, r: 52, c: 2 }, { x: 1105, y: 250, r: 34, c: 2 },
    { x: 960, y: 430, r: 62, c: 3 }, { x: 1080, y: 500, r: 38, c: 3 }, { x: 860, y: 520, r: 26, c: 3 },
    { x: 745, y: 420, r: 20, c: 1 }, { x: 1130, y: 380, r: 22, c: 4 }, { x: 1040, y: 585, r: 18, c: 5 },
  ];
  const bubbleColor = (c: number) => CLUSTER_COLORS[c % CLUSTER_COLORS.length];

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: BG,
        position: 'relative', fontFamily: 'sans-serif',
      }}>
        {bubbles.map((b, i) => (
          <div key={i} style={{
            position: 'absolute', left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2,
            borderRadius: 9999, border: `2px solid ${bubbleColor(b.c)}`,
            background: `${bubbleColor(b.c)}7a`, display: 'flex',
          }} />
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '56px 64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 40 }}>🍌</span>
            <span style={{ fontSize: 34, fontWeight: 800, color: TEXT, display: 'flex' }}>
              Banana<span style={{ color: ACCENT }}>Maps</span>
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {g?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.logo} width={84} height={84} style={{ borderRadius: 9999 }} alt="" />
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 58, fontWeight: 800, color: TEXT }}>{name.slice(0, 22)}</span>
                {symbol ? <span style={{ fontSize: 26, color: TEXT2 }}>{symbol}{g ? ` · ${CHAIN_LABEL[g.chain] || g.chain}` : ''}</span> : null}
              </div>
            </div>
            {price ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: TEXT }}>{price}</span>
                {change !== 0 ? (
                  <span style={{ fontSize: 28, fontWeight: 700, color: change >= 0 ? THEME.up : THEME.down }}>
                    {change >= 0 ? '+' : '-'}{Math.abs(change).toFixed(1)}% 24h
                  </span>
                ) : null}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 12 }}>
              {(g ? [
                [`${clusterCount}`, 'clusters'],
                [`${top10}%`, 'top 10 hold'],
                [`${g.totalHolders ? (g.totalHolders > 1000 ? (g.totalHolders / 1000).toFixed(0) + 'K' : g.totalHolders) : g.nodes.filter(n => n.kind === 'holder').length}`, 'holders'],
              ] : [['4', 'chains'], ['500', 'wallets mapped'], ['live', 'transfer flows']]).map(([v, l], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 22px' }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: TEXT }}>{v}</span>
                  <span style={{ fontSize: 20, color: TEXT2 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          <span style={{ fontSize: 22, color: TEXT2 }}>
            Who really holds the bag? · bananamaps.io
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
