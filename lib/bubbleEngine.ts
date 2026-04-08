export interface Holder {
  label?: string | null;
  labelType?: string | null;
  address: string;
  balance: number;
  balanceFormatted?: number;
  usdValue?: number;
  pct: number;
  rank: number;
  cluster?: number;
  connections?: number[];
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  radius?: number;
}

export interface Connection {
  from: number; // index into holders array (sender)
  to: number;   // index into holders array (receiver)
  bidirectional?: boolean;
}

export function initBubbles(holders: Holder[], width: number, height: number): Holder[] {
  const maxPct = holders[0]?.pct || 1;
  const minR = 6, maxR = 60;
  const total = holders.length;
  const cx = width / 2, cy = height / 2;
  const maxSpread = Math.min(width, height) * 0.46;
  return holders.map((h, i) => {
    const angle = i * 2.399963;
    const r = maxSpread * Math.sqrt((i + 0.5) / total);
    return {
      ...h,
      radius: minR + (Math.pow(h.pct / maxPct, 0.35)) * (maxR - minR),
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0, vy: 0,
    };
  });
}

export function detectClusters(holders: Holder[], connections: Connection[]): Holder[] {
  const n = holders.length;
  const result = holders.map(h => ({ ...h, cluster: undefined as number | undefined, connections: [] as number[] }));

  if (!connections.length) return result;

  // Union-Find
  const parent = Array.from({ length: n }, (_, i) => i);
  const ufRank = new Array(n).fill(0);
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a: number, b: number) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (ufRank[ra] < ufRank[rb]) parent[ra] = rb;
    else if (ufRank[ra] > ufRank[rb]) parent[rb] = ra;
    else { parent[rb] = ra; ufRank[ra]++; }
  }

  // Track which holder indices appear in any connection
  const connected = new Set<number>();
  for (const c of connections) {
    if (c.from >= 0 && c.from < n && c.to >= 0 && c.to < n && c.from !== c.to) {
      union(c.from, c.to);
      connected.add(c.from);
      connected.add(c.to);
      result[c.from].connections!.push(c.to);
      result[c.to].connections!.push(c.from);
    }
  }

  // Assign cluster IDs only to connected wallets
  const rootToCluster = new Map<number, number>();
  let nextCluster = 0;
  for (const idx of connected) {
    const root = find(idx);
    if (!rootToCluster.has(root)) rootToCluster.set(root, nextCluster++);
    result[idx].cluster = rootToCluster.get(root);
  }

  return result;
}

export function applyForces(bubbles: Holder[], width: number, height: number): Holder[] {
  const arr = bubbles.map(b => ({ ...b }));
  const cx = width / 2, cy = height / 2;
  const boundaryR = Math.min(width, height) * 0.48;
  for (let i = 0; i < arr.length; i++) {
    let fx = 0, fy = 0;
    const a = arr[i], ax = a.x || 0, ay = a.y || 0;

    // Gentle center attraction
    fx += (cx - ax) * 0.00015;
    fy += (cy - ay) * 0.00015;

    // Same cluster attraction — pull connected wallets toward each other
    if (a.cluster !== undefined) {
      for (let j = 0; j < arr.length; j++) {
        if (i === j || arr[j].cluster !== a.cluster) continue;
        const dx = (arr[j].x || 0) - ax, dy = (arr[j].y || 0) - ay;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = (a.radius || 10) + (arr[j].radius || 10) + 35;
        if (dist > target) {
          fx += (dx / dist) * 0.008;
          fy += (dy / dist) * 0.008;
        }
      }
    }

    // Bubble repulsion — generous spacing
    for (let j = 0; j < arr.length; j++) {
      if (i === j) continue;
      const dx = ax - (arr[j].x || 0), dy = ay - (arr[j].y || 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const minD = (a.radius || 10) + (arr[j].radius || 10) + 28;
      if (dist < minD) {
        const f = (minD - dist) / minD;
        fx += (dx / dist) * f * 0.6;
        fy += (dy / dist) * f * 0.6;
      }
    }

    // Cross-group repulsion
    if (a.cluster !== undefined) {
      for (let j = 0; j < arr.length; j++) {
        if (i === j || arr[j].cluster === a.cluster) continue;
        const dx = ax - (arr[j].x || 0), dy = ay - (arr[j].y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 200) {
          const f = (200 - dist) / 200;
          fx += (dx / dist) * f * 0.2;
          fy += (dy / dist) * f * 0.2;
        }
      }
    }

    const distFromCenter = Math.sqrt((ax - cx) ** 2 + (ay - cy) ** 2);
    if (distFromCenter > boundaryR - (a.radius || 10)) {
      const strength = Math.pow((distFromCenter - (boundaryR - (a.radius || 10))) / boundaryR, 1.5) * 2;
      fx += (cx - ax) / distFromCenter * strength;
      fy += (cy - ay) / distFromCenter * strength;
    }
    const vx = ((a.vx || 0) + fx) * 0.85;
    const vy = ((a.vy || 0) + fy) * 0.85;
    arr[i] = { ...a, x: ax + vx, y: ay + vy, vx, vy };
  }
  return arr;
}

export const CLUSTER_COLORS = ['#a855f7','#14b8a6','#f97316','#ec4899','#3b82f6','#84cc16','#f43f5e','#06b6d4'];

function drawConnection(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, bidirectional: boolean
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  if (bidirectional) {
    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = color + '44';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 4]);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawBubbles(
  ctx: CanvasRenderingContext2D, bubbles: Holder[],
  width: number, height: number, hoveredIndex: number, selectedIndex: number,
  connections?: Connection[]
) {
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height) * 0.8);
  bg.addColorStop(0, '#0d0a00'); bg.addColorStop(1, '#0a0800');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);

  // Stars
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    ctx.arc((Math.sin(i*137.508)*0.5+0.5)*width, (Math.cos(i*97.311)*0.5+0.5)*height, 0.4+(i%3)*0.25, 0, Math.PI*2);
    ctx.fillStyle = `rgba(245,200,66,${0.015+(i%5)*0.008})`; ctx.fill();
  }

  // Draw connection lines between wallets with real on-chain transfers
  if (connections && connections.length > 0) {
    for (const conn of connections) {
      const a = bubbles[conn.from];
      const b = bubbles[conn.to];
      if (!a || !b) continue;
      const x1 = a.x || 0, y1 = a.y || 0;
      const x2 = b.x || 0, y2 = b.y || 0;
      const dx = x2 - x1, dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      const r1 = (a.radius || 10) + 2;
      const r2 = (b.radius || 10) + 2;
      const color = a.cluster !== undefined
        ? CLUSTER_COLORS[a.cluster % CLUSTER_COLORS.length]
        : 'rgba(160,170,200,0.5)';
      drawConnection(ctx, x1 + nx * r1, y1 + ny * r1, x2 - nx * r2, y2 - ny * r2, color, !!conn.bidirectional);
    }
  }

  // Draw bubbles
  bubbles.forEach((b, i) => {
    const x = b.x || 0, y = b.y || 0, r = b.radius || 10;
    const isHovered = i === hoveredIndex, isSelected = i === selectedIndex;
    const hasCluster = b.cluster !== undefined;
    const color = hasCluster ? CLUSTER_COLORS[b.cluster! % CLUSTER_COLORS.length] : 'rgba(140,150,190,0.9)';

    // Glow on all bubbles — stronger for hovered/selected/large
    const glowAlpha = isHovered || isSelected ? 0.25 : 0.1;
    const glowSize = isHovered || isSelected ? 2.2 : 1.6;
    const glow = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * glowSize);
    glow.addColorStop(0, hasCluster ? color + Math.round(glowAlpha * 255).toString(16).padStart(2, '0') : `rgba(140,150,190,${glowAlpha})`);
    glow.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(x, y, r * glowSize, 0, Math.PI * 2);
    ctx.fillStyle = glow; ctx.fill();

    // Bubble fill
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    const fill = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, 0, x, y, r);
    if (hasCluster) {
      fill.addColorStop(0, color + '22'); fill.addColorStop(1, color + '08');
    } else {
      fill.addColorStop(0, 'rgba(30,35,60,0.8)'); fill.addColorStop(1, 'rgba(15,18,35,0.6)');
    }
    ctx.fillStyle = fill; ctx.fill();

    // Bubble border
    ctx.strokeStyle = isHovered || isSelected
      ? (hasCluster ? color : 'rgba(200,210,255,1)')
      : (hasCluster ? color + 'cc' : 'rgba(120,130,180,0.45)');
    ctx.lineWidth = isHovered || isSelected ? 2 : 1.2; ctx.stroke();

    // Inner ring detail for larger bubbles
    if (r > 18) {
      ctx.beginPath(); ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
      ctx.strokeStyle = hasCluster ? color + '15' : 'rgba(100,110,160,0.1)';
      ctx.lineWidth = 0.8; ctx.stroke();
    }

    // Specular highlight
    ctx.beginPath(); ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();

    // Exchange / entity label on bubble
    const label = b.label;
    if (label && r >= 14) {
      const fontSize = Math.max(7, Math.min(r * 0.38, 14));
      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 3;
      // Truncate long names to fit the bubble
      let displayName = label;
      const maxWidth = r * 1.6;
      while (ctx.measureText(displayName).width > maxWidth && displayName.length > 3) {
        displayName = displayName.slice(0, -1);
      }
      if (displayName.length < label.length) displayName += '…';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(displayName, x, y);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
  });
}
