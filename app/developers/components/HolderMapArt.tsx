// Decorative, static rendering of a holder map inside a browser frame. Fixed
// coordinates (no randomness) so server and client markup match. The stats pill
// and the "Powered by" badge are HTML laid over the SVG rather than SVG rects, so
// each box is sized by its own text and cannot overflow whatever font is loaded.

import Wordmark from '../../components/Wordmark';

const NODES: { x: number; y: number; r: number; tone: 'gold' | 'dim' | 'cex' }[] = [
  { x: 150, y: 120, r: 34, tone: 'gold' },
  { x: 230, y: 78, r: 18, tone: 'gold' },
  { x: 210, y: 170, r: 14, tone: 'gold' },
  { x: 96, y: 190, r: 12, tone: 'gold' },
  { x: 330, y: 120, r: 26, tone: 'cex' },
  { x: 400, y: 70, r: 12, tone: 'dim' },
  { x: 420, y: 180, r: 16, tone: 'dim' },
  { x: 60, y: 80, r: 10, tone: 'dim' },
  { x: 300, y: 215, r: 9, tone: 'dim' },
  { x: 370, y: 230, r: 7, tone: 'dim' },
  { x: 120, y: 250, r: 8, tone: 'dim' },
  { x: 460, y: 120, r: 7, tone: 'dim' },
  { x: 260, y: 240, r: 11, tone: 'gold' },
];
const EDGES: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 2], [2, 12], [4, 5], [4, 6], [4, 8], [6, 9], [3, 10], [6, 11]];

const FILL = { gold: 'rgba(245,200,66,0.85)', dim: 'rgba(245,200,66,0.28)', cex: 'rgba(98,126,234,0.75)' };
const LABEL_FONT = "'Bricolage Grotesque', sans-serif";

export default function HolderMapArt({ caption = 'yoursite.com/token/pepe' }: { caption?: string }) {
  return (
    <div className="dev-art">
      <div className="dev-art-frame">
        <div className="dev-art-bar" aria-hidden>
          <span className="dev-art-dot" /><span className="dev-art-dot" /><span className="dev-art-dot" />
          <span className="dev-art-url">{caption}</span>
        </div>
        <div className="dev-art-canvas">
          <svg viewBox="0 0 500 290" width="100%" role="img" aria-label="Illustration of a BananaMaps holder map embedded in a web page" style={{ display: 'block', borderRadius: 10, background: 'var(--bg)' }}>
            <defs>
              <radialGradient id="dev-art-glow" cx="30%" cy="40%" r="60%">
                <stop offset="0%" stopColor="rgba(245,200,66,0.10)" />
                <stop offset="100%" stopColor="rgba(245,200,66,0)" />
              </radialGradient>
            </defs>
            <rect width="500" height="290" fill="url(#dev-art-glow)" />
            {EDGES.map(([a, b]) => (
              <line key={`${a}-${b}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke="rgba(245,200,66,0.22)" strokeWidth="1.2" />
            ))}
            {NODES.map((n, i) => (
              <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={FILL[n.tone]} stroke="rgba(10,8,0,0.9)" strokeWidth="1.5" />
            ))}
            <text x="150" y="124" textAnchor="middle" fontFamily={LABEL_FONT} fontSize="11" fill="#0a0800" fontWeight="700">6.8%</text>
            <text x="330" y="124" textAnchor="middle" fontFamily={LABEL_FONT} fontSize="9" fill="#0a0800" fontWeight="700" letterSpacing="0.4">CEX</text>
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
