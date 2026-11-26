// Client-side layout + canvas rendering for the token graph ("visual v2").
//
// The graph handed in here should already be shaped by lib/graphView.toViewGraph
// (one-off counterparties folded away, clusters = ≥2 top holders). This module
// only lays out and draws:
//   • Bubbles: translucent filled discs with a thin rim and a soft glow for
//     clustered holders; unclustered holders are navy; labeled entities (CEX /
//     DEX / burn / contract) are gray; surviving counterparties are small dots.
//   • Links: thin solid lines, no arrowheads at rest. Direction appears only
//     for the focused wallet (hover or selection): its links turn bright with
//     arrowheads and everything else dims.
//   • Layout: d3-force with softer repulsion and shorter, stiffer intra-cluster
//     links than v1 → tight clumps on a sparse field.
import { forceSimulation, forceManyBody, forceCollide, forceLink, forceX, forceY } from 'd3-force';
import type { Simulation, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import type { TokenGraph, GraphNode } from './graphTypes';
import { THEME, hexA } from './theme';

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
  /** Both endpoints are top holders (drawn a touch stronger than holder↔satellite). */
  holderToHolder: boolean;
}

// Muted jewel tones: readable against navy, never neon. Order = cluster id.
// No amber/yellow: it would read as the accent and collide with THEME.warn.
export const CLUSTER_COLORS = [
  '#B95CD6', // orchid
  '#2EC4B6', // teal
  '#7B6CF6', // violet
  '#E8716A', // coral
  '#4F9DE8', // sky
  '#8CC152', // lime
  '#E0669B', // rose
  '#45B8D8', // cyan
  '#4CBF7A', // green
];

export const clusterColor = (c: number) => CLUSTER_COLORS[c % CLUSTER_COLORS.length];

const HOLDER_MIN_R = 6;
const HOLDER_MAX_R = 58;
const COUNTERPARTY_R = 2.6;

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
  const spread = Math.min(width, height) * 0.40;
  graph.clusters.forEach((c, i) => {
    const a = i * 2.399963;
    const r = spread * (0.3 + 0.7 * Math.sqrt((i + 0.5) / Math.max(graph.clusters.length, 1)));
    clusterSeeds.set(c.id, { x: width / 2 + Math.cos(a) * r, y: height / 2 + Math.sin(a) * r });
  });

  let unclusteredCount = 0;
  graph.nodes.forEach((n, idx) => {
    if (hidden.has(n.address)) return;
    let x: number, y: number;
    if (n.cluster !== undefined && clusterSeeds.has(n.cluster)) {
      const seed = clusterSeeds.get(n.cluster)!;
      const a = idx * 2.399963;
      const r = 8 + (idx % 7) * 7;
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
    links.push({
      source: a, target: b, count: e.count,
      cluster: a.node.cluster ?? b.node.cluster,
      holderToHolder: a.node.kind === 'holder' && b.node.kind === 'holder',
    });
  }

  // Intra-cluster links are short + stiff → tight clumps. Links that cross a
  // cluster boundary (or touch an unclustered wallet) only tug gently, enough to
  // keep a stray satellite near the holder it belongs to.
  const intra = (l: SimLink) => {
    const s = l.source as SimNode, t = l.target as SimNode;
    return s.node.cluster !== undefined && s.node.cluster === t.node.cluster;
  };

  const sim = forceSimulation<SimNode>(nodes)
    .force('charge', forceManyBody<SimNode>().strength(d => d.node.kind === 'counterparty' ? -40 : -320).distanceMax(480))
    .force('collide', forceCollide<SimNode>().radius(d => d.radius + 5).strength(1.0).iterations(2))
    .force('link', forceLink<SimNode, SimLink>(links)
      .distance(l => (l.source as SimNode).radius + (l.target as SimNode).radius + 7)
      .strength(l => intra(l) ? (l.holderToHolder ? 1.0 : 0.7) : 0.12))
    .force('x', forceX<SimNode>(width / 2).strength(0.05))
    .force('y', forceY<SimNode>(height / 2).strength(0.05))
    .alphaDecay(0.02)
    .stop();

  return { nodes, links, sim };
}

// Unclustered holders read as navy discs; satellites as dim dots; labeled
// entities as gray. All translucent — overlapping bubbles must both stay legible.
const NAVY_BODY = (a: number) => `rgba(62,80,128,${0.34 * a})`;
const NAVY_RIM = (a: number) => `rgba(128,148,200,${0.55 * a})`;
const GRAY_BODY = (a: number) => `rgba(96,102,118,${0.30 * a})`;
const GRAY_RIM = (a: number) => `rgba(150,156,172,${0.75 * a})`;
const SATELLITE = (a: number) => `rgba(120,135,175,${0.5 * a})`;
const UNCLUSTERED_LINK = '#8A9BC4';

export interface DrawState {
  hoveredIdx: number;      // graph node index or -1
  selectedIdx: number;     // graph node index or -1
  highlight: Set<string>;  // addresses matched by the sidebar search / legend hover
  /** Current view zoom — line widths and arrowheads are kept legible in screen space. */
  scale: number;
}

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  g: GraphSim,
  state: DrawState,
) {
  const scale = state.scale || 1;
  // World-space sizes that hold a minimum SCREEN size regardless of zoom.
  const lineW = Math.max(1.1, 1.1 / scale);
  const focusLineW = Math.max(1.4, 1.4 / scale);
  const arrowS = Math.max(5, 6 / scale);

  // Focus = the selected wallet, else the hovered one. Selection dims the rest of
  // the field hard; a passing hover only softens it so the map doesn't flicker.
  const focusIdx = state.selectedIdx >= 0 ? state.selectedIdx : state.hoveredIdx;
  const dimTo = state.selectedIdx >= 0 ? 0.35 : 0.7;
  const focusSet = new Set<number>();
  if (focusIdx >= 0) {
    focusSet.add(focusIdx);
    for (const l of g.links) {
      const s = l.source as SimNode, t = l.target as SimNode;
      if (s.idx === focusIdx) focusSet.add(t.idx);
      if (t.idx === focusIdx) focusSet.add(s.idx);
    }
  }

  // Links first — beneath bubbles. Solid, thin, quiet. Direction is NOT drawn at
  // rest; it appears (bright line + arrowhead at the receiver) only on the
  // focused wallet's links, so the field reads as constellations, not traffic.
  ctx.setLineDash([]);
  for (const l of g.links) {
    const s = l.source as SimNode, t = l.target as SimNode;
    const x1 = s.x || 0, y1 = s.y || 0, x2 = t.x || 0, y2 = t.y || 0;
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist, ny = dy / dist;
    // Trim to bubble edges
    const sx = x1 + nx * (s.radius + 1), sy = y1 + ny * (s.radius + 1);
    const ex = x2 - nx * (t.radius + 1), ey = y2 - ny * (t.radius + 1);
    if ((ex - sx) * nx + (ey - sy) * ny <= 0) continue; // bubbles overlap, skip

    const inFocus = focusIdx >= 0 && (s.idx === focusIdx || t.idx === focusIdx);
    const base = l.cluster !== undefined ? clusterColor(l.cluster) : UNCLUSTERED_LINK;
    const restAlpha = (l.holderToHolder ? 0.5 : 0.32) * (focusIdx >= 0 ? dimTo : 1);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = hexA(base, inFocus ? 0.95 : restAlpha);
    ctx.lineWidth = inFocus ? focusLineW : lineW;
    ctx.stroke();
    if (inFocus) {
      // Arrowhead at the receiver end (sender → receiver)
      ctx.beginPath();
      ctx.moveTo(ex + nx * 2, ey + ny * 2);
      ctx.lineTo(ex - nx * arrowS - ny * arrowS * 0.5, ey - ny * arrowS + nx * arrowS * 0.5);
      ctx.lineTo(ex - nx * arrowS + ny * arrowS * 0.5, ey - ny * arrowS - nx * arrowS * 0.5);
      ctx.closePath();
      ctx.fillStyle = hexA(base, 0.9);
      ctx.fill();
    }
  }

  // Bubbles
  for (const sn of g.nodes) {
    const n = sn.node;
    const x = sn.x || 0, y = sn.y || 0, r = sn.radius;
    const hot = sn.idx === state.hoveredIdx || sn.idx === state.selectedIdx;
    const dim = focusIdx >= 0 && !focusSet.has(sn.idx);
    const isHighlit = state.highlight.has(n.address);
    const clustered = n.cluster !== undefined;
    const a = dim ? dimTo : 1;

    // Surviving counterparties: small dots, tinted by their cluster.
    if (n.kind === 'counterparty' && !n.pct) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = clustered ? hexA(clusterColor(n.cluster!), 0.55 * a) : SATELLITE(a);
      ctx.fill();
      if (hot || isHighlit) {
        ctx.lineWidth = Math.max(1.5, 1.5 / scale);
        ctx.strokeStyle = hot ? '#FFFFFF' : THEME.accent;
        ctx.stroke();
      }
      continue;
    }

    let body: string, rim: string, glow: string | null;
    if (n.labelType) {
      body = GRAY_BODY(a); rim = GRAY_RIM(a); glow = null;
    } else if (clustered) {
      const c = clusterColor(n.cluster!);
      body = hexA(c, (hot ? 0.62 : 0.48) * a); rim = hexA(c, 0.95 * a); glow = hexA(c, 0.22 * a);
    } else {
      body = NAVY_BODY(a); rim = NAVY_RIM(a); glow = null;
    }

    // Soft glow under clustered holders. Skipped for bubbles too small on screen
    // to show it — a radial gradient per node per frame is the costly part.
    if (glow && r * scale >= 6) {
      const gr = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.8);
      gr.addColorStop(0, glow); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = gr; ctx.fill();
    }

    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill();
    ctx.lineWidth = hot || isHighlit ? Math.max(2, 2 / scale) : Math.max(1.25, 1.25 / scale);
    ctx.strokeStyle = hot ? '#FFFFFF' : isHighlit ? THEME.accent : rim;
    ctx.stroke();

    // Entity label (CEX etc.) on big-enough bubbles
    if (n.label && r >= 14) {
      const fontSize = Math.max(7, Math.min(r * 0.4, 13));
      ctx.font = `600 ${fontSize}px ${THEME.fontSans}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let name = n.label;
      const maxW = r * 1.7;
      while (ctx.measureText(name).width > maxW && name.length > 3) name = name.slice(0, -1);
      if (name.length < n.label.length) name += '…';
      ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
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
