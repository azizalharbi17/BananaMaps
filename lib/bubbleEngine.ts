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
}

export function initBubbles(holders: Holder[], width: number, height: number): Holder[] {
  const maxBal = holders[0]?.balance || 1;
  const minR = 8, maxR = 55;
  const total = holders.length;
  const cx = width / 2, cy = height / 2;
  const maxSpread = Math.min(width, height) * 0.40;
  return holders.map((h, i) => {
    const angle = i * 2.399963;
    const r = maxSpread * Math.sqrt((i + 0.5) / total);
    return {
      ...h,
      radius: minR + (Math.sqrt(h.balance / maxBal)) * (maxR - minR),
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0, vy: 0,
    };
  });
}

export function detectClusters(holders: Holder[]): Holder[] {
  const result = holders.map(h => ({ ...h, cluster: undefined as number | undefined }));
  let clusterId = 0;
  const used = new Set<number>();
  for (let i = 0; i < result.length; i++) {
    if (used.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < result.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(result[i].pct - result[j].pct) < 0.5 && result[i].pct < 5 && result[j].pct < 5) group.push(j);
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
  // Strictly circular boundary — this is what makes it globe shaped
  const boundaryR = Math.min(width, height) * 0.43;

  for (let i = 0; i < arr.length; i++) {
    let fx = 0, fy = 0;
    const a = arr[i], ax = a.x || 0, ay = a.y || 0;

    // Center gravity
    fx += (cx - ax) * 0.0002;
    fy += (cy - ay) * 0.0002;

    // Cluster attraction
    if (a.cluster !== undefined) {
      for (let j = 0; j < arr.length; j++) {
        if (i === j || arr[j].cluster !== a.cluster) continue;
        const dx = (arr[j].x||0)-ax, dy = (arr[j].y||0)-ay;
        const dist = Math.sqrt(dx*dx+dy*dy)||1;
        const target = (a.radius||10)+(arr[j].radius||10)+22;
        if (dist > target) { fx += (dx/dist)*0.012; fy += (dy/dist)*0.012; }
      }
    }

    // Bubble repulsion
    for (let j = 0; j < arr.length; j++) {
      if (i === j) continue;
      const dx = ax-(arr[j].x||0), dy = ay-(arr[j].y||0);
      const dist = Math.sqrt(dx*dx+dy*dy)||1;
      const minD = (a.radius||10)+(arr[j].radius||10)+45;
      if (dist < minD) { const f=(minD-dist)/minD; fx+=(dx/dist)*f*0.5; fy+=(dy/dist)*f*0.5; }
    }

    // Cross cluster repulsion
    if (a.cluster !== undefined) {
      for (let j = 0; j < arr.length; j++) {
        if (i===j||arr[j].cluster===a.cluster) continue;
        const dx = ax-(arr[j].x||0), dy = ay-(arr[j].y||0);
        const dist = Math.sqrt(dx*dx+dy*dy)||1;
        if (dist < 160) { const f=(160-dist)/160; fx+=(dx/dist)*f*0.3; fy+=(dy/dist)*f*0.3; }
      }
    }

    // CIRCULAR boundary only — no square walls
    const distFromCenter = Math.sqrt((ax-cx)**2 + (ay-cy)**2);
    if (distFromCenter > boundaryR - (a.radius||10)) {
      // Push back toward center along the radial direction
      const strength = Math.pow((distFromCenter - (boundaryR - (a.radius||10))) / boundaryR, 1.5) * 2;
      fx += (cx - ax) / distFromCenter * strength;
      fy += (cy - ay) / distFromCenter * strength;
    }

    let vx = ((a.vx||0)+fx)*0.87;
    let vy = ((a.vy||0)+fy)*0.87;
    // NO hard wall clamping — only circular boundary
    const x = ax+vx, y = ay+vy;
    arr[i] = {...a, x, y, vx, vy};
  }
  return arr;
}

export function applyClusterAttraction(b: Holder[]): Holder[] { return b; }
export function stepPhysics(b: Holder[], w: number, h: number): Holder[] { return b; }
export function resolveCollisions(b: Holder[]): Holder[] { return b; }

export const CLUSTER_COLORS = ['#a855f7','#14b8a6','#f97316','#ec4899','#3b82f6','#84cc16','#f43f5e','#06b6d4'];

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  const dx=x2-x1, dy=y2-y1, dist=Math.sqrt(dx*dx+dy*dy)||1;
  const nx=dx/dist, ny=dy/dist;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
  ctx.strokeStyle=color+'44'; ctx.lineWidth=0.8; ctx.stroke();
  const as=4;
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-nx*as-ny*as*0.5,y2-ny*as+nx*as*0.5);
  ctx.lineTo(x2-nx*as+ny*as*0.5,y2-ny*as-nx*as*0.5);
  ctx.closePath(); ctx.fillStyle=color+'77'; ctx.fill();
}

export function drawBubbles(
  ctx: CanvasRenderingContext2D,
  bubbles: Holder[],
  width: number, height: number,
  hoveredIndex: number, selectedIndex: number
) {
  ctx.clearRect(0,0,width,height);

  const bg = ctx.createRadialGradient(width/2,height/2,0,width/2,height/2,Math.max(width,height)*0.8);
  bg.addColorStop(0,'#0d0a00');
  bg.addColorStop(1,'#0a0800');
  ctx.fillStyle=bg; ctx.fillRect(0,0,width,height);

  for(let i=0;i<60;i++){
    ctx.beginPath();
    ctx.arc((Math.sin(i*137.508)*0.5+0.5)*width,(Math.cos(i*97.311)*0.5+0.5)*height,0.4+(i%3)*0.25,0,Math.PI*2);
    ctx.fillStyle=`rgba(245,200,66,${0.015+(i%5)*0.008})`; ctx.fill();
  }

  const groups: Record<number,Holder[]> = {};
  bubbles.forEach(b => { if(b.cluster!==undefined){if(!groups[b.cluster])groups[b.cluster]=[];groups[b.cluster].push(b);}});
  Object.entries(groups).forEach(([id,group]) => {
    const color = CLUSTER_COLORS[Number(id)%CLUSTER_COLORS.length];
    const hub = group.reduce((a,b)=>a.balance>b.balance?a:b);
    group.forEach(m => {
      if(m===hub)return;
      const x1=hub.x||0,y1=hub.y||0,x2=m.x||0,y2=m.y||0;
      const dx=x2-x1,dy=y2-y1,dist=Math.sqrt(dx*dx+dy*dy)||1;
      const nx=dx/dist,ny=dy/dist,r1=(hub.radius||10)+1,r2=(m.radius||10)+1;
      drawArrow(ctx,x1+nx*r1,y1+ny*r1,x2-nx*r2,y2-ny*r2,color);
    });
  });

  bubbles.forEach((b,i) => {
    const x=b.x||0, y=b.y||0, r=b.radius||10;
    const isHovered=i===hoveredIndex, isSelected=i===selectedIndex;
    const hasCluster=b.cluster!==undefined;
    const color=hasCluster?CLUSTER_COLORS[b.cluster!%CLUSTER_COLORS.length]:'rgba(160,170,200,0.9)';
    if(isHovered||isSelected||(b.pct>3)){
      const glow=ctx.createRadialGradient(x,y,r*0.5,x,y,r*2);
      glow.addColorStop(0,hasCluster?color+'28':'rgba(160,170,200,0.1)');
      glow.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(x,y,r*2,0,Math.PI*2);
      ctx.fillStyle=glow; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    const fill=ctx.createRadialGradient(x-r*0.15,y-r*0.15,0,x,y,r);
    if(hasCluster){
      fill.addColorStop(0,color+'22'); fill.addColorStop(1,color+'08');
    } else {
      fill.addColorStop(0,'rgba(30,35,60,0.8)'); fill.addColorStop(1,'rgba(15,18,35,0.6)');
    }
    ctx.fillStyle=fill; ctx.fill();
    ctx.strokeStyle=isHovered||isSelected?(hasCluster?color:'rgba(200,210,255,1)'):(hasCluster?color+'cc':'rgba(120,130,180,0.45)');
    ctx.lineWidth=isHovered||isSelected?2:1.2; ctx.stroke();
    if(r>18){
      ctx.beginPath(); ctx.arc(x,y,r*0.65,0,Math.PI*2);
      ctx.strokeStyle=hasCluster?color+'15':'rgba(100,110,160,0.1)';
      ctx.lineWidth=0.8; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x-r*0.28,y-r*0.28,r*0.1,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fill();
  });

  // Soft vignette to hide canvas edges
  const vig = ctx.createRadialGradient(width/2,height/2,Math.min(width,height)*0.38,width/2,height/2,Math.max(width,height)*0.72);
  vig.addColorStop(0,"transparent");
  vig.addColorStop(1,"rgba(10,8,0,0.96)");
  ctx.fillStyle=vig; ctx.fillRect(0,0,width,height);
}
