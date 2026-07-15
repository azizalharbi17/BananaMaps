import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { lookupCachedGraphForToken } from '@/lib/tokenLookup';

export const dynamic = 'force-dynamic';

const CHAIN_LABEL: Record<string, string> = { eth: 'Ethereum', bsc: 'BSC', sol: 'Solana', base: 'Base', robinhood: 'Robinhood Chain' };
// Same saturated palette as the map
const RING_COLORS = ['#E040FB', '#7C4DFF', '#FFD600', '#1DE9B6', '#FF6D00', '#2979FF'];

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

  // Decorative bubble field on the right — echoes the map's ring style
  const bubbles = [
    { x: 780, y: 110, r: 72, c: 0 }, { x: 905, y: 205, r: 44, c: 0 }, { x: 848, y: 320, r: 30, c: 0 },
    { x: 1035, y: 130, r: 52, c: 2 }, { x: 1105, y: 250, r: 34, c: 2 },
    { x: 960, y: 430, r: 62, c: 3 }, { x: 1080, y: 500, r: 38, c: 3 }, { x: 860, y: 520, r: 26, c: 3 },
    { x: 745, y: 420, r: 20, c: 1 }, { x: 1130, y: 380, r: 22, c: 4 }, { x: 1040, y: 585, r: 18, c: 5 },
  ];

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(135deg, #120e00 0%, #0a0800 60%, #0d0a02 100%)',
        position: 'relative', fontFamily: 'sans-serif',
      }}>
        {bubbles.map((b, i) => (
          <div key={i} style={{
            position: 'absolute', left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2,
            borderRadius: 9999, border: `4px solid ${RING_COLORS[b.c]}`,
            background: `${RING_COLORS[b.c]}2e`, display: 'flex',
          }} />
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '56px 64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 40 }}>🍌</span>
            <span style={{ fontSize: 34, fontWeight: 800, color: '#f0ede6', display: 'flex' }}>
              Banana<span style={{ color: '#F5C842' }}>Maps</span>
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              {g?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.logo} width={84} height={84} style={{ borderRadius: 9999 }} alt="" />
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 58, fontWeight: 800, color: '#faf6ea' }}>{name.slice(0, 22)}</span>
                {symbol ? <span style={{ fontSize: 26, color: 'rgba(245,200,66,0.7)' }}>{symbol}{g ? ` · ${CHAIN_LABEL[g.chain] || g.chain}` : ''}</span> : null}
              </div>
            </div>
            {price ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: '#f0ede6' }}>{price}</span>
                {change !== 0 ? (
                  <span style={{ fontSize: 28, fontWeight: 700, color: change >= 0 ? '#2EE89A' : '#EF4444' }}>
                    {change >= 0 ? '+' : '-'}{Math.abs(change).toFixed(1)}% 24h
                  </span>
                ) : null}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 12 }}>
              {(g ? [
                [`${g.clusters.length}`, 'clusters'],
                [`${top10}%`, 'top 10 hold'],
                [`${g.totalHolders ? (g.totalHolders > 1000 ? (g.totalHolders / 1000).toFixed(0) + 'K' : g.totalHolders) : g.nodes.filter(n => n.kind === 'holder').length}`, 'holders'],
              ] : [['4', 'chains'], ['500', 'wallets mapped'], ['live', 'transfer flows']]).map(([v, l], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, background: 'rgba(245,200,66,0.08)', border: '1px solid rgba(245,200,66,0.25)', borderRadius: 14, padding: '10px 22px' }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: '#F5C842' }}>{v}</span>
                  <span style={{ fontSize: 20, color: 'rgba(245,235,200,0.6)' }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          <span style={{ fontSize: 22, color: 'rgba(245,235,200,0.45)' }}>
            Who really holds the bag? · bananamaps.io
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
