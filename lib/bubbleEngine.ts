export interface Holder {
  address: string;
  balance: number;
  pct: number;
  rank: number;
  cluster?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  radius?: number;
  label?: string;
}

export function initBubbles(holders: Holder[], width: number, height: number): Holder[] {
  const maxBal = holders[0]?.balance || 1;
  const minR = 8, maxR = 60;
  return holders.map((h, i) => ({
    ...h,
    radius: minR + (Math.sqrt(h.balance / maxBal)) * (maxR - minR),
    x: width / 2 + (Math.random() - 0.5) * width * 0.5,
    y: height / 2 + (Math.random() - 0.5) * height * 0.5,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    label: h.address.slice(0, 6) + '...' + h.address.slice(-4),
  }));
}

export function stepPhysics(bubbles: Holder[], width: number, height: number): Holder[] {
  const cx = width / 2, cy = height / 2;
  return bubbles.map(b => {
    let { x = 0, y = 0, vx = 0, vy = 0, radius = 10 } = b;
    vx += (cx - x) * 0.001;
    vy += (cy - y) * 0.001;
    vx *= 0.95;
    vy *= 0.95;
    x += vx;
    y += vy;
    if (x - radius < 0) { x = radius; vx = Math.abs(vx); }
    if (x + radius > width) { x = width - radius; vx = -Math.abs(vx); }
    if (y - radius < 0) { y = radius; vy = Math.abs(vy); }
    if (y + radius > height) { y = height - radius; vy = -Math.abs(vy); }
    return { ...b, x, y, vx, vy };
  });
}

export function resolveCollisions(bubbles: Holder[]): Holder[] {
  const arr = [...bubbles];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      const dx = (b.x || 0) - (a.x || 0);
      const dy = (b.y || 0) - (a.y || 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const minDist = (a.radius || 10) + (b.radius || 10) + 2;
      if (dist < minDist) {
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        arr[i] = { ...a, x: (a.x || 0) - nx * overlap, y: (a.y || 0) - ny * overlap };
        arr[j] = { ...b, x: (b.x || 0) + nx * overlap, y: (b.y || 0) + ny * overlap };
      }
    }
  }
  return arr;
}

const CLUSTER_COLORS = ['#F5C842','#2EE89A','#FF4545','#4DAAFF','#C87BFF','#FF8C42','#FF69B4','#00FFFF'];

export function drawBubbles(
  ctx: CanvasRenderingContext2D,
  bubbles: Holder[],
  width: number,
  height: number,
  hoveredIndex: number
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0e0e0c';
  ctx.fillRect(0, 0, width, height);
  const grd = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width*0.5);
  grd.addColorStop(0, 'rgba(245,200,66,0.04)');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);
  bubbles.forEach((b, i) => {
    const x = b.x || 0, y = b.y || 0, r = b.radius || 10;
    const isHovered = i === hoveredIndex;
    const color = b.cluster !== undefined ? CLUSTER_COLORS[b.cluster % CLUSTER_COLORS.length] : '#F5C842';
    if (isHovered || b.pct > 1) {
      ctx.beginPath();
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
      glow.addColorStop(0, color + '33');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.arc(x, y, r * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(x - r*0.3, y - r*0.3, 0, x, y, r);
    grad.addColorStop(0, color + 'cc');
    grad.addColorStop(1, color + '44');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = isHovered ? color : color + '66';
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.stroke();
    if (r > 18) {
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.max(9, r * 0.28)}px "Bricolage Grotesque", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.pct.toFixed(1) + '%', x, y);
    }
  });
}
