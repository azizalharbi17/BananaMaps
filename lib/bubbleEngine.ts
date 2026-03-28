export interface Holder {
  address: string;
  balance: number;
  balanceFormatted?: number;
  usdValue?: number;
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
  const minR = 10, maxR = 65;
  const total = holders.length;
  const cx = width / 2, cy = height / 2;
  const maxSpread = Math.min(width, height) * 0.42;

  return holders.map((h, i) => {
    // Place bubbles in a circular spread using golden angle
    const angle = i * 2.399963; // golden angle in radians
    const r = maxSpread * Math.sqrt((i + 0.5) / total);
    return {
      ...h,
      radius: minR + (Math.sqrt(h.balance / maxBal)) * (maxR - minR),
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    };
  });
}

export function detectClusters(holders: Holder[]): Holder[] {
  const result = holders.map(h => ({ ...h, cluster: undefined as number | undefined }));
  let clusterId = 0;
  const used = new Set<number>();
  for (let i = 0; i < result.length; i++) {
    if (used.has(i)) continue;
    const group: number[] = [i];
    for (let j = i + 1; j < result.length; j++) {
      if (used.has(j)) continue;
      const pctDiff = Math.abs(result[i].pct - result[j].pct);
      if (pctDiff < 0.5 && result[i].pct < 5 && result[j].pct < 5) group.push(j);
    }
    if (group.length >= 2) {
      group.forEach(idx => { result[idx].cluster = clusterId; used.add(idx); });
      clusterId++;
    }
  }
  return result;
}

export function applyForces(bubbles: Holder[], width: number, height: number): Holder[] {
  const arr = bubbles.map(b => ({ ...b }));
  const cx = width / 2, cy = height / 2;
  for (let i = 0; i < arr.length; i++) {
    let fx = 0, fy = 0;
    const a = arr[i];
    const ax = a.x || 0, ay = a.y || 0;

    // Gentle center gravity
    fx += (cx - ax) * 0.0002;
    fy += (cy - ay) * 0.0002;

    // Cluster attraction
    if (a.cluster !== undefined) {
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const b = arr[j];
        if (b.cluster !== a.cluster) continue;
        const dx = (b.x||0) - ax, dy = (b.y||0) - ay;
        const dist = Math.sqrt(dx*dx+dy*dy) || 1;
        const targetDist = (a.radius||10) + (b.radius||10) + 20;
        if (dist > targetDist) { fx += (dx/dist)*0.012; fy += (dy/dist)*0.012; }
      }
    }

    // Repulsion between all bubbles
    for (let j = 0; j < arr.length; j++) {
      if (i === j) continue;
      const b = arr[j];
      const dx = ax - (b.x||0), dy = ay - (b.y||0);
      const dist = Math.sqrt(dx*dx+dy*dy) || 1;
      const minDist = (a.radius||10) + (b.radius||10) + 55;
      if (dist < minDist) { const f = (minDist-dist)/minDist; fx += (dx/dist)*f*0.5; fy += (dy/dist)*f*0.5; }
    }

    // Cross-cluster repulsion
    if (a.cluster !== undefined) {
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const b = arr[j];
        if (b.cluster === a.cluster) continue;
        const dx = ax - (b.x||0), dy = ay - (b.y||0);
        const dist = Math.sqrt(dx*dx+dy*dy) || 1;
        if (dist < 200) { const f = (200-dist)/200; fx += (dx/dist)*f*0.3; fy += (dy/dist)*f*0.3; }
      }
    }

    // Soft circular boundary — push back if too far from center
    const distFromCenter = Math.sqrt((ax-cx)**2 + (ay-cy)**2);
    const maxRadius = Math.min(width, height) * 0.46;
    if (distFromCenter > maxRadius) {
      const f = (distFromCenter - maxRadius) / maxRadius;
      fx += (cx - ax) / distFromCenter * f * 0.8;
      fy += (cy - ay) / distFromCenter * f * 0.8;
    }

    let vx = ((a.vx||0) + fx) * 0.85;
    let vy = ((a.vy||0) + fy) * 0.85;
    let x = ax + vx, y = ay + vy;
    const pad = (a.radius||10) + 20;
    if (x < pad) { x = pad; vx *= -0.3; }
    if (x > width-pad) { x = width-pad; vx *= -0.3; }
    if (y < pad) { y = pad; vy *= -0.3; }
    if (y > height-pad) { y = height-pad; vy *= -0.3; }
    arr[i] = { ...a, x, y, vx, vy };
  }
  return arr;
}

export function applyClusterAttraction(b: Holder[]): Holder[] { return b; }
export function stepPhysics(b: Holder[], w: number, h: number): Holder[] { return b; }
export function resolveCollisions(b: Holder[]): Holder[] { return b; }

export const CLUSTER_COLORS = ['#a855f7','#14b8a6','#f97316','#ec4899','#3b82f6','#84cc16','#f43f5e','#06b6d4'];

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  const dx = x2-x1, dy = y2-y1, dist = Math.sqrt(dx*dx+dy*dy)||1;
  const nx = dx/dist, ny = dy/dist;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
  ctx.strokeStyle = color+'55'; ctx.lineWidth = 1; ctx.stroke();
  const as = 5;
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-nx*as-ny*as*0.5,y2-ny*as+nx*as*0.5);
  ctx.lineTo(x2-nx*as+ny*as*0.5,y2-ny*as-nx*as*0.5);
  ctx.closePath(); ctx.fillStyle = color+'88'; ctx.fill();
}

export function drawBubbles(
  ctx: CanvasRenderingContext2D,
  bubbles: Holder[],
  width: number,
  height: number,
  hoveredIndex: number,
  selectedIndex: number
) {
  ctx.clearRect(0,0,width,height);

  // Deep warm background
  const bg = ctx.createRadialGradient(width/2,height/2,0,width/2,height/2,Math.max(width,height));
  bg.addColorStop(0,'#0f0b00'); bg.addColorStop(1,'#060400');
  ctx.fillStyle = bg; ctx.fillRect(0,0,width,height);

  // Star dots
  for (let i=0;i<80;i++) {
    ctx.beginPath();
    ctx.arc((Math.sin(i*137.508)*0.5+0.5)*width,(Math.cos(i*97.311)*0.5+0.5)*height,0.5+(i%3)*0.3,0,Math.PI*2);
    ctx.fillStyle=`rgba(245,200,66,${0.025+(i%4)*0.012})`; ctx.fill();
  }

  // Soft circular vignette to blend edges
  const vignette = ctx.createRadialGradient(width/2,height/2,Math.min(width,height)*0.28,width/2,height/2,Math.min(width,height)*0.52);
  vignette.addColorStop(0,'transparent');
  vignette.addColorStop(1,'rgba(6,4,0,0.85)');
  // Draw after bubbles (at the end)

  // Cluster lines first
  const clusterGroups: Record<number,Holder[]> = {};
  bubbles.forEach(b => { if(b.cluster!==undefined){if(!clusterGroups[b.cluster])clusterGroups[b.cluster]=[];clusterGroups[b.cluster].push(b);}});
  Object.entries(clusterGroups).forEach(([id,group]) => {
    const color = CLUSTER_COLORS[Number(id)%CLUSTER_COLORS.length];
    const hub = group.reduce((a,b)=>a.balance>b.balance?a:b);
    group.forEach(m => {
      if(m===hub)return;
      const x1=hub.x||0,y1=hub.y||0,x2=m.x||0,y2=m.y||0;
      const dx=x2-x1,dy=y2-y1,dist=Math.sqrt(dx*dx+dy*dy)||1;
      const nx=dx/dist,ny=dy/dist,r1=(hub.radius||10)+2,r2=(m.radius||10)+2;
      drawArrow(ctx,x1+nx*r1,y1+ny*r1,x2-nx*r2,y2-ny*r2,color);
    });
  });

  // Bubbles
  bubbles.forEach((b,i) => {
    const x=b.x||0,y=b.y||0,r=b.radius||10;
    const isHovered=i===hoveredIndex,isSelected=i===selectedIndex;
    const hasCluster=b.cluster!==undefined;
    const color=hasCluster?CLUSTER_COLORS[b.cluster!%CLUSTER_COLORS.length]:'#F5C842';
    if(isHovered||isSelected){
      const glow=ctx.createRadialGradient(x,y,r*0.3,x,y,r*2.5);
      glow.addColorStop(0,color+'33'); glow.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(x,y,r*2.5,0,Math.PI*2); ctx.fillStyle=glow; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    if(hasCluster){
      const g=ctx.createRadialGradient(x-r*0.2,y-r*0.2,0,x,y,r);
      g.addColorStop(0,color+'50'); g.addColorStop(1,color+'15'); ctx.fillStyle=g;
    } else {
      const g=ctx.createRadialGradient(x-r*0.2,y-r*0.2,0,x,y,r);
      g.addColorStop(0,'rgba(245,200,66,0.10)'); g.addColorStop(1,'rgba(245,200,66,0.02)'); ctx.fillStyle=g;
    }
    ctx.fill();
    ctx.strokeStyle=isHovered||isSelected?color:(hasCluster?color+'bb':'rgba(245,200,66,0.25)');
    ctx.lineWidth=isHovered||isSelected?2.5:1.5; ctx.stroke();
    if(r>22){
      ctx.beginPath(); ctx.arc(x,y,r*0.7,0,Math.PI*2);
      ctx.strokeStyle=hasCluster?color+'20':'rgba(245,200,66,0.06)'; ctx.lineWidth=1; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x-r*0.25,y-r*0.28,r*0.14,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.10)'; ctx.fill();
  });

  // Apply circular vignette ON TOP to create globe/circle feel
  ctx.fillStyle = vignette;
  ctx.fillRect(0,0,width,height);
}
