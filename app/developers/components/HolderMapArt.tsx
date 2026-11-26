// Decorative, static rendering of a holder map inside a browser frame, drawn in
// the app's "visual v2" look: navy canvas, translucent discs with a thin rim,
// tinted clusters, gray exchange, thin links. Fixed coordinates (no randomness)
// so server and client markup match. The stats pill and the "Powered by" badge
// are HTML laid over the SVG rather than SVG rects, so each box is sized by its
// own text and cannot overflow whatever font is loaded.

import Wordmark from '../../components/Wordmark';
import { CLUSTER_COLORS } from '@/lib/mapEngine';
import { hexA } from '@/lib/theme';

type Tone = 'c1' | 'c2' | 'navy' | 'cex';

const NODES: { x: number; y: number; r: number; tone: Tone }[] = [
  { x: 150, y: 120, r: 34, tone: 'c1' },
  { x: 230, y: 78, r: 18, tone: 'c1' },
  { x: 210, y: 170, r: 14, tone: 'c1' },
  { x: 96, y: 190, r: 12, tone: 'c1' },
  { x: 330, y: 120, r: 26, tone: 'cex' },
  { x: 400, y: 70, r: 12, tone: 'navy' },
  { x: 420, y: 180, r: 16, tone: 'c2' },
  { x: 60, y: 80, r: 10, tone: 'navy' },
  { x: 300, y: 215, r: 9, tone: 'navy' },
  { x: 370, y: 230, r: 7, tone: 'c2' },
  { x: 120, y: 250, r: 8, tone: 'navy' },
  { x: 460, y: 120, r: 7, tone: 'c2' },
  { x: 260, y: 240, r: 11, tone: 'c1' },
];
const EDGES: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 2], [2, 12], [4, 5], [4, 6], [4, 8], [6, 9], [6, 11], [9, 11], [3, 10]];

// Same recipe as lib/mapEngine drawGraph: clustered = cluster color (body 48%,
// rim 95%); unclustered = navy; labeled entity (CEX) = gray.
const STYLE: Record<Tone, { fill: string; stroke: string }> = {
  c1: { fill: hexA(CLUSTER_COLORS[0], 0.48), stroke: hexA(CLUSTER_COLORS[0], 0.95) },
  c2: { fill: hexA(CLUSTER_COLORS[1], 0.48), stroke: hexA(CLUSTER_COLORS[1], 0.95) },
  navy: { fill: 'rgba(62,80,128,0.34)', stroke: 'rgba(128,148,200,0.55)' },
  cex: { fill: 'rgba(96,102,118,0.3)', stroke: 'rgba(150,156,172,0.75)' },
};
const LINK = 'rgba(138,155,196,0.4)';

export default function HolderMapArt({ caption = 'yoursite.com/token/pepe' }: { caption?: string }) {
  return (
    <div className="dev-art">
      <div className="dev-art-frame">
        <div className="dev-art-bar" aria-hidden>
          <span className="dev-art-dot" /><span className="dev-art-dot" /><span className="dev-art-dot" />
          <span className="dev-art-url">{caption}</span>
        </div>
        <div className="dev-art-canvas">
          <svg viewBox="0 0 500 290" width="100%" role="img" aria-label="Illustration of a BananaMaps holder map embedded in a web page" style={{ display: 'block', borderRadius: 7, background: 'var(--map-bg)' }}>
            {EDGES.map(([a, b]) => (
              <line key={`${a}-${b}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke={LINK} strokeWidth="1.1" />
            ))}
            {NODES.map((n, i) => (
              <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={STYLE[n.tone].fill} stroke={STYLE[n.tone].stroke} strokeWidth="1.25" />
            ))}
            {/* Entity label on the exchange bubble, as the app draws it (Inter inherited from the page). */}
            <text x="330" y="120" textAnchor="middle" dominantBaseline="central" fontSize="10" fill="rgba(255,255,255,0.9)" fontWeight="600">CEX</text>
          </svg>
          {/* Overlays: decorative, so hidden from assistive tech (the SVG label describes the picture). */}
          <span className="dev-art-pill dev-art-pill-stats" aria-hidden>150 holders · 4 clusters</span>
          <span className="dev-art-pill dev-art-pill-badge" aria-hidden>
            Powered by <Wordmark suffix="Maps" />
          </span>
        </div>
      </div>
    </div>
  );
}
