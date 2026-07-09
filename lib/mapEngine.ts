// Client-side layout + canvas rendering for the token graph.
// Layout follows the BubbleMaps look: sparse field, tight clumps.
//   forceManyBody -500, forceCollide r+10 strength 1.0,
//   forceLink intra-cluster only (short + stiff), weak centering, alphaDecay 0.02.
import {
  forceSimulation, forceManyBody, forceCollide, forceLink, forceX, forceY,
  Simulation, SimulationNodeDatum, SimulationLinkDatum,
} from 'd3-force';
import { TokenGraph, GraphNode } from './graphTypes';

export interface SimNode extends SimulationNodeDatum {
  idx: number;            // index into graph.nodes
  node: GraphNode;
  radius: number;
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode | number;
  target: SimNode | number;
  count: number;
  cluster?: number;
}

// One saturated color per cluster (BubbleMaps palette: magenta, purple, yellow, teal…)
export const CLUSTER_COLORS = [
  '#E040FB', // magenta
  '#7C4DFF', // purple
  '#FFD600', // yellow
  '#1DE9B6', // teal
  '#FF6D00', // orange
  '#2979FF', // blue
  '#C6FF00', // lime
  '#FF4081', // rose
  '#00E5FF', // cyan
  '#00E676', // green
];

export const clusterColor = (c: number) => CLUSTER_COLORS[c % CLUSTER_COLORS.length];

const HOLDER_MIN_R = 5;
const HOLDER_MAX_R = 56;
const COUNTERPARTY_R = 3;

export function nodeRadius(node: GraphNode, maxPct: number): number {
  if (node.kind === 'counterparty' && !node.pct) return COUNTERPARTY_R;
  // Area ∝ % of supply
  const t = Math.sqrt(Math.max(node.pct, 0) / Math.max(maxPct, 0.0001));
  return HOLDER_MIN_R + t * (HOLDER_MAX_R - HOLDER_MIN_R);
}

export interface GraphSim {
  nodes: SimNode[];
  links: SimLink[];
  sim: Simulation<SimNode, SimLink>;
}

/**
 * Build a d3-force simulation over the visible subset of the graph.
 * `hidden` = addresses toggled off (CEX/burn by default). Hidden nodes are
 * removed from both layout and render; edges touching them are dropped.
 */
export function buildSim(
  graph: TokenGraph,
  hidden: Set<string>,
  width: number,
  height: number,
): GraphSim {
  // Size against the largest VISIBLE holder — with exchanges hidden by default,
  // anchoring to a hidden Binance wallet would flatten every visible bubble.
  const visiblePcts = graph.nodes.filter(n => !hidden.has(n.address)).map(n => n.pct);
  const maxPct = Math.max(...(visiblePcts.length ? visiblePcts : [0]), 0.0001);
  const visIdx = new Map<number, SimNode>();
  const nodes: SimNode[] = [];

  // Seed positions: one golden-angle slot per cluster so components start apart,
  // members jittered around their cluster seed → tight clumps settle fast.
  const clusterSeeds = new Map<number, { x: number; y: number }>();
  const spread = Math.min(width, height) * 0.38;
  graph.clusters.forEach((c, i) => {
    const a = i * 2.399963;
    const r = spread * (0.35 + 0.65 * Math.sqrt((i + 0.5) / Math.max(graph.clusters.length, 1)));
    clusterSeeds.set(c.id, { x: width / 2 + Math.cos(a) * r, y: height / 2 + Math.sin(a) * r });
  });

  let unclusteredCount = 0;
  graph.nodes.forEach((n, idx) => {
    if (hidden.has(n.address)) return;
    let x: number, y: number;
    if (n.cluster !== undefined && clusterSeeds.has(n.cluster)) {
      const seed = clusterSeeds.get(n.cluster)!;
      const a = idx * 2.399963;
      const r = 10 + (idx % 7) * 8;
      x = seed.x + Math.cos(a) * r;
      y = seed.y + Math.sin(a) * r;
    } else {
      const a = unclusteredCount * 2.399963 + 1.7;
      const r = spread * Math.sqrt((unclusteredCount + 0.5) / Math.max(graph.nodes.length, 1));
      x = width / 2 + Math.cos(a) * r;
      y = height / 2 + Math.sin(a) * r;
      unclusteredCount++;
    }
    const sn: SimNode = { idx, node: n, radius: nodeRadius(n, maxPct), x, y };
    visIdx.set(idx, sn);
    nodes.push(sn);
  });

  const links: SimLink[] = [];
  for (const e of graph.edges) {
    const a = visIdx.get(e.from), b = visIdx.get(e.to);
    if (!a || !b) continue;
    links.push({ source: a, target: b, count: e.count, cluster: a.node.cluster ?? b.node.cluster });
  }

  // forceLink only over intra-cluster edges: short + stiff → tight clumps.
  const intraLinks = links.filter(l => {
    const s = l.source as SimNode, t = l.target as SimNode;
    return s.node.cluster !== undefined && s.node.cluster === t.node.cluster;
  });

  const sim = forceSimulation<SimNode>(nodes)
    .force('charge', forceManyBody<SimNode>().strength(-500).distanceMax(600))
    .force('collide', forceCollide<SimNode>().radius(d => d.radius + 10).strength(1.0).iterations(2))
    .force('link', forceLink<SimNode, SimLink>(intraLinks)
      .distance(l => (l.source as SimNode).radius + (l.target as SimNode).radius + 12)
      .strength(0.8))
    .force('x', forceX<SimNode>(width / 2).strength(0.04))
    .force('y', forceY<SimNode>(height / 2).strength(0.04))
    .alphaDecay(0.02)
    .stop();

  return { nodes, links, sim };
}

const NAVY_FILL = 'rgba(26,34,63,0.92)';
const NAVY_STROKE = 'rgba(90,108,160,0.75)';
const GRAY_FILL = 'rgba(72,76,88,0.85)';
const GRAY_STROKE = 'rgba(140,145,160,0.8)';

function hexA(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
}

export interface DrawState {
  hoveredIdx: number;      // graph node index or -1
  selectedIdx: number;     // graph node index or -1
  highlight: Set<string>;  // addresses matched by the sidebar search
  /** Current view zoom — line widths and arrowheads are kept legible in screen space. */
  scale: number;
}

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  g: GraphSim,
  state: DrawState,
) {
  const scale = state.scale || 1;
  // World-space sizes that hold a minimum SCREEN size regardless of zoom,
  // so thin edges and arrowheads stay visible at autoFit zoom levels.
  const lineW = Math.max(1, 1 / scale);
  const arrowS = Math.max(4.5, 5.5 / scale);

  // Edges first — beneath bubbles. Short, thin, semi-transparent, arrowheads.
  for (const l of g.links) {
    const s = l.source as SimNode, t = l.target as SimNode;
    const x1 = s.x || 0, y1 = s.y || 0, x2 = t.x || 0, y2 = t.y || 0;
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist, ny = dy / dist;
    // Trim to bubble edges
    const sx = x1 + nx * (s.radius + 1), sy = y1 + ny * (s.radius + 1);
    const ex = x2 - nx * (t.radius + 4), ey = y2 - ny * (t.radius + 4);
    if ((ex - sx) * nx + (ey - sy) * ny <= 0) continue; // bubbles overlap, skip

    const color = l.cluster !== undefined ? hexA(clusterColor(l.cluster), 0.45) : 'rgba(130,140,170,0.3)';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.stroke();
    // Arrowhead at receiver end (directional: sender → receiver)
    const as = arrowS;
    ctx.beginPath();
    ctx.moveTo(ex + nx * 3.5, ey + ny * 3.5);
    ctx.lineTo(ex - nx * as - ny * as * 0.55, ey - ny * as + nx * as * 0.55);
    ctx.lineTo(ex - nx * as + ny * as * 0.55, ey - ny * as - nx * as * 0.55);
    ctx.closePath();
    ctx.fillStyle = l.cluster !== undefined ? hexA(clusterColor(l.cluster), 0.7) : 'rgba(130,140,170,0.5)';
    ctx.fill();
  }

  // Bubbles
  for (const sn of g.nodes) {
    const n = sn.node;
    const x = sn.x || 0, y = sn.y || 0, r = sn.radius;
    const isHovered = sn.idx === state.hoveredIdx;
    const isSelected = sn.idx === state.selectedIdx;
    const isHighlit = state.highlight.has(n.address);
    const clustered = n.cluster !== undefined;
    const isLabeled = !!n.labelType; // CEX/DEX/burn/contract → gray when shown

    let fill: string, stroke: string;
    if (isLabeled) {
      fill = GRAY_FILL; stroke = GRAY_STROKE;
    } else if (clustered) {
      const c = clusterColor(n.cluster!);
      fill = hexA(c, 0.8); stroke = c;
    } else if (n.kind === 'counterparty') {
      fill = 'rgba(96,110,150,0.55)'; stroke = 'rgba(120,134,175,0.5)';
    } else {
      fill = NAVY_FILL; stroke = NAVY_STROKE;
    }

    // Soft glow for hovered / selected; highlighted matches get the cheaper ring below
    // (a broad search query can match hundreds of nodes — per-node gradients would
    // allocate hundreds of radial gradients every frame).
    if (isHovered || isSelected) {
      const c = clustered ? clusterColor(n.cluster!) : '#8FA3D9';
      const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.9);
      glow.addColorStop(0, hexA(c, 0.3));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
      ctx.fillStyle = glow; ctx.fill();
    }

    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = isHovered || isSelected ? '#FFFFFF' : stroke;
    ctx.lineWidth = isHovered || isSelected ? 2 : isHighlit ? 2 : 1.2;
    if (isHighlit && !isHovered && !isSelected) ctx.strokeStyle = '#FFD600';
    ctx.stroke();

    // Entity label (CEX etc.) on big-enough bubbles
    if (n.label && r >= 14) {
      const fontSize = Math.max(7, Math.min(r * 0.4, 13));
      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let name = n.label;
      const maxW = r * 1.7;
      while (ctx.measureText(name).width > maxW && name.length > 3) name = name.slice(0, -1);
      if (name.length < n.label.length) name += '…';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(name, x, y);
    }
  }
}

/**
 * Hit-test in world coordinates; returns graph node index or -1.
 * Prefers smaller (topmost-drawn) nodes; tiny nodes get a clickable halo that
 * holds a minimum SCREEN size (≈7px) at any zoom level.
 */
export function findNodeAt(g: GraphSim, wx: number, wy: number, scale = 1): number {
  const minR = 7 / Math.max(scale, 0.01);
  let found = -1, foundR = Infinity;
  for (const sn of g.nodes) {
    const dx = (sn.x || 0) - wx, dy = (sn.y || 0) - wy;
    const r = Math.max(sn.radius, minR);
    if (dx * dx + dy * dy < r * r && sn.radius < foundR) { found = sn.idx; foundR = sn.radius; }
  }
  return found;
}
