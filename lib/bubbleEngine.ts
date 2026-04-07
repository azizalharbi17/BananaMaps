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

export function initBubbles(holders: Holder[], width: number, height: number): Holder[] {
  const maxPct = holders[0]?.pct || 1;
  const minR = 6, maxR = 60;
  const total = holders.length;
  const cx = width / 2, cy = height / 2;
  const maxSpread = Math.min(width, height) * 0.42;
  return holders.map((h, i) => {
    const angle = i * 2.399963;
    const r = maxSpread * Math.sqrt((i + 0.5) / total);
    return {
      ...h,
      radius: minR + (Math.sqrt(h.pct / maxPct)) * (maxR - minR),
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0, vy: 0,
    };
  });
}

export function detectClusters(holders: Holder[]): Holder[] {
  // No fake clustering — return holders as-is
  // Real clusters will come from transaction data in the API
  return holders.map(h => ({ ...h }));
}

export function applyForces(bubbles: Holder[], width: number, height: number): Holder[] {
  const arr = bubbles.map(b => ({ ...b }));
  const cx = width / 2, cy = height / 2;
  const boundaryR = Math.min(width, height) * 0.43;
  for (let i = 0; i < arr.length; i++) {
    let fx = 0, fy = 0;
    const a = arr[i], ax = a.x || 0, ay = a.y || 0;
    fx += (cx - ax) * 0.0003;
    fy += (cy - ay) * 0.0003;
    for (let j = 0; j < arr.length; j++) {
      if (i === j) continue;
      const dx = ax - (arr[j].x || 0), dy = ay - (arr[j].y || 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const minD = (a.radius || 10) + (arr[j].radius || 10) + 8;
      if (dist < minD) {
        const f = (minD - dist) / minD;
        fx += (dx / dist) * f * 0.6;
        fy += (dy / dist) * f * 0.6;
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

export function drawBubbles(
  ctx: CanvasRenderingContext2D, bubbles: Holder[],
  width: number, height: number, hoveredIndex: number, selectedIndex: number
) {
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height) * 0.8);
  bg.addColorStop(0, '#0d0a00'); bg.addColorStop(1, '#0a0800');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    ctx.arc((Math.sin(i*137.508)*0.5+0.5)*width, (Math.cos(i*97.311)*0.5+0.5)*height, 0.4+(i%3)*0.25, 0, Math.PI*2);
    ctx.fillStyle = `rgba(245,200,66,${0.015+(i%5)*0.008})`; ctx.fill();
  }
  bubbles.forEach((b, i) => {
    const x = b.x || 0, y = b.y || 0, r = b.radius || 10;
    const isHovered = i === hoveredIndex, isSelected = i === selectedIndex;
    if (isHovered || isSelected || b.pct > 2) {
      const glow = ctx.createRadialGradient(x, y, r*0.5, x, y, r*2);
      glow.addColorStop(0, 'rgba(160,170,200,0.12)'); glow.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(x, y, r*2, 0, Math.PI*2);
      ctx.fillStyle = glow; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    const fill = ctx.createRadialGradient(x-r*0.15, y-r*0.15, 0, x, y, r);
    fill.addColorStop(0, 'rgba(30,35,60,0.8)'); fill.addColorStop(1, 'rgba(15,18,35,0.6)');
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = isHovered || isSelected ? 'rgba(200,210,255,1)' : 'rgba(120,130,180,0.45)';
    ctx.lineWidth = isHovered || isSelected ? 2.5 : 1.2; ctx.stroke();
    if (r > 18) {
      ctx.beginPath(); ctx.arc(x, y, r*0.65, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(100,110,160,0.1)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x-r*0.28, y-r*0.28, r*0.1, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  });
  const vig = ctx.createRadialGradient(width/2, height/2, Math.min(width,height)*0.38, width/2, height/2, Math.max(width,height)*0.72);
  vig.addColorStop(0, 'transparent'); vig.addColorStop(1, 'rgba(10,8,0,0.96)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, width, height);
}
