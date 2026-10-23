import * as THREE from 'three';

// Shared verbatim by the desktop header and the interactive day preview.
const WIDTH = 270, HEIGHT = 81.2, VIEW_W = 350, VIEW_H = 177.2;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
function randomGenerator() {
  let seed = 271828;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function simplify(points, epsilon = .34) {
  if (points.length <= 3) return points;
  const a = points[0], b = points[points.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  let furthest = 0, distance = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], t = length ? clamp(((p.x-a.x)*dx + (p.y-a.y)*dy)/length) : 0;
    const d = Math.hypot(p.x-a.x-t*dx, p.y-a.y-t*dy);
    if (d > distance) { distance = d; furthest = i; }
  }
  return distance > epsilon
    ? [...simplify(points.slice(0, furthest+1), epsilon).slice(0,-1), ...simplify(points.slice(furthest), epsilon)]
    : [a,b];
}

async function fractureShapes(src) {
  const image = new Image(); image.src = src; await image.decode();
  const raster = document.createElement('canvas'); raster.width = 540; raster.height = 163;
  const ctx = raster.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Wordmark mask unavailable');
  const scale = Math.min(raster.width/image.width, raster.height/image.height);
  ctx.drawImage(image, (raster.width-image.width*scale)/2, (raster.height-image.height*scale)/2, image.width*scale, image.height*scale);
  const pixels = ctx.getImageData(0,0,raster.width,raster.height).data;
  const w = raster.width, h = raster.height, solid = [], owners = new Int16Array(w*h).fill(-1);
  for (let i=0;i<w*h;i++) if (pixels[i*4+3] > 100 && pixels[i*4] > 70) solid.push(i);
  if (!solid.length) throw new Error('Empty wordmark mask');
  const rand = randomGenerator(), seeds = [];
  // Farthest-candidate sampling produces irregular, evenly distributed fractures.
  for (let n=0;n<74;n++) {
    let best, bestDistance=-1;
    for (let k=0;k<24;k++) {
      const pixel=solid[Math.floor(rand()*solid.length)], p={x:pixel%w,y:Math.floor(pixel/w)};
      const distance = seeds.length ? Math.min(...seeds.map(s=>(p.x-s.x)**2+(p.y-s.y)**2)) : 1;
      if (distance>bestDistance) { best=p; bestDistance=distance; }
    }
    seeds.push(best);
  }
  for (const i of solid) {
    const x=i%w,y=Math.floor(i/w); let nearest=0,distance=Infinity;
    seeds.forEach((s,n)=>{const d=(x-s.x)**2+(y-s.y)**2;if(d<distance){distance=d;nearest=n;}});
    owners[i]=nearest;
  }
  const edges = seeds.map(()=>new Map());
  const vertex=(x,y)=>y*(w+1)+x;
  function edge(id,x1,y1,x2,y2) {
    const start=vertex(x1,y1), end=vertex(x2,y2);
    if(!edges[id].has(start)) edges[id].set(start,[]);
    edges[id].get(start).push(end);
  }
  for(const i of solid){
    const x=i%w,y=Math.floor(i/w),id=owners[i];
    if(y===0||owners[i-w]!==id) edge(id,x,y,x+1,y);
    if(x===w-1||owners[i+1]!==id) edge(id,x+1,y,x+1,y+1);
    if(y===h-1||owners[i+w]!==id) edge(id,x+1,y+1,x,y+1);
    if(x===0||owners[i-1]!==id) edge(id,x,y+1,x,y);
  }
  const pieces=[];
  edges.forEach((map,id)=>{
    const loops=[];
    while(map.size){
      const first=map.keys().next().value;let current=first;const points=[];
      do {
        points.push(new THREE.Vector2((current%(w+1))/2-WIDTH/2,HEIGHT/2-Math.floor(current/(w+1))/2));
        const next=map.get(current); if(!next) break;
        const end=next.pop();if(!next.length)map.delete(current);current=end;
      } while(current!==first && points.length<20000);
      if(points.length<4)continue;
      const half=Math.floor(points.length/2);
      const reduced=[...simplify(points.slice(0,half+1)).slice(0,-1),...simplify([...points.slice(half),points[0]]).slice(0,-1)];
      if(reduced.length>=3 && Math.abs(THREE.ShapeUtils.area(reduced))>.35) loops.push(reduced);
    }
    const outside=loops.filter(p=>THREE.ShapeUtils.isClockWise(p));
    const holes=loops.filter(p=>!THREE.ShapeUtils.isClockWise(p));
    const contains=(p,poly)=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;};
    outside.forEach(points=>{
      const shape=new THREE.Shape(points);
      holes.filter(hole=>contains(hole[0],points)).forEach(hole=>shape.holes.push(new THREE.Path(hole)));
      const cx=points.reduce((s,p)=>s+p.x,0)/points.length,cy=points.reduce((s,p)=>s+p.y,0)/points.length;
      pieces.push({shape,cx,cy,id});
    });
  });
  return pieces;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} src
 * @param {{stage?: number, onError?: () => void}} options
 */
export async function createDesktopWordmark(canvas, src, options = {}) {
  const shapes=await fractureShapes(src), rand=randomGenerator();
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
  const scene=new THREE.Scene(), camera=new THREE.OrthographicCamera(-VIEW_W/2,VIEW_W/2,VIEW_H/2,-VIEW_H/2,.1,1000);
  camera.position.set(0,0,400);camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x2a3443,2.1));
  const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(-100,140,220);scene.add(key);
  const cyan=new THREE.DirectionalLight(0x70ddff,2.3);cyan.position.set(-180,-20,45);scene.add(cyan);
  const gold=new THREE.DirectionalLight(0xffc66b,2.5);gold.position.set(180,40,25);scene.add(gold);
  const material=new THREE.MeshStandardMaterial({color:0xf2f3f5,roughness:.25,metalness:.28});
  const side=new THREE.MeshStandardMaterial({color:0xb0bac8,roughness:.48,metalness:.36});
  const pieces=shapes.map(({shape,cx,cy,id},index)=>{
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:3.4,bevelEnabled:true,bevelSize:.22,bevelThickness:.3,bevelSegments:2,steps:1,curveSegments:1});
    geometry.translate(-cx,-cy,-1.7);
    const mesh=new THREE.Mesh(geometry,[material,side]);scene.add(mesh);
    const order=rand(),direction=rand()*Math.PI*2;
    return {mesh,cx,cy,order,dx:Math.cos(direction)*(13+rand()*28),dy:-12-rand()*42,dz:(rand()-.25)*40,rx:(rand()-.5)*3,ry:(rand()-.5)*3,rz:(rand()-.5)*2.5,late:index%17===0};
  });
  const moteGeometry=new THREE.OctahedronGeometry(.6,0);
  const moteMaterials=[new THREE.MeshBasicMaterial({color:0x9cecff}),new THREE.MeshBasicMaterial({color:0xffce83})];
  const motes=Array.from({length:100},(_,i)=>{
    const anchor=pieces[Math.floor(rand()*pieces.length)],mesh=new THREE.Mesh(moteGeometry,moteMaterials[i%2]);scene.add(mesh);
    return {mesh,anchor,dx:(rand()-.5)*42,dy:-rand()*54,dz:rand()*30,s:.25+rand()*.85,delay:rand()*.45};
  });
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let value=0,target=0,from=0,started=0,duration=2200,raf=0,disposed=false,visible=true,stage=clamp(options.stage??0),held=false,entryReady=false,timer=0;
  function draw(progress){
    pieces.forEach(p=>{
      const loosen=smooth((progress-.14-p.order*.55)/.28);
      const cracks=smooth(progress/.28)*.20;
      p.mesh.position.set(p.cx+p.dx*loosen+Math.sign(p.cx)*cracks,p.cy+p.dy*loosen-Math.sign(p.cy)*cracks,p.dz*loosen);
      p.mesh.rotation.set(p.rx*loosen,p.ry*loosen,p.rz*loosen);
      const vanish=p.late ? smooth((progress-.985)/.06) : smooth((progress-.77-p.order*.16)/.13);
      p.mesh.scale.setScalar(1-vanish);p.mesh.visible=vanish<.999;
    });
    motes.forEach(p=>{
      const movement=smooth((progress-p.delay)/.65),scale=movement*(1-smooth((progress-.9)/.16));
      p.mesh.visible=scale>.005;
      p.mesh.position.set(p.anchor.cx+p.dx*movement,p.anchor.cy+p.dy*movement,p.dz*movement+3);
      p.mesh.rotation.set(movement*4,movement*6,movement*3);p.mesh.scale.setScalar(p.s*scale);
    });
    canvas.dataset.fractureProgress=progress.toFixed(4);
    renderer.render(scene,camera);
  }
  function tick(now){
    raf=0;if(disposed||!visible||document.hidden)return;
    const t=clamp((now-started)/duration);value=from+(target-from)*smooth(t);draw(value);
    if(t<1)raf=requestAnimationFrame(tick);
  }
  function animate(next){
    target=next;from=value;started=performance.now();duration=next<value?1350:2500;
    cancelAnimationFrame(raf);raf=0;
    if(motion.matches){value=target;draw(value);}else if(visible&&!document.hidden)raf=requestAnimationFrame(tick);
  }
  function refresh(){animate(entryReady&&!held?stage:0);}
  function resize(){
    const rect=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);draw(value);
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;if(visible)refresh();else {cancelAnimationFrame(raf);raf=0;}});intersection.observe(canvas);
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else refresh();};
  document.addEventListener('visibilitychange',visibility);
  motion.addEventListener('change',refresh);
  const contextLost=event=>{event.preventDefault();options.onError?.();};canvas.addEventListener('webglcontextlost',contextLost);
  function replay(){clearTimeout(timer);entryReady=false;animate(0);timer=window.setTimeout(()=>{entryReady=true;refresh();},2000);}
  draw(0);replay();
  return {
    setStage(next){stage=clamp(next);refresh();},
    setHovered(next){held=next;refresh();},
    setLight(light){material.color.set(light?0x28303a:0xf2f3f5);side.color.set(light?0x455568:0xb0bac8);draw(value);},
    replay,
    dispose(){disposed=true;clearTimeout(timer);cancelAnimationFrame(raf);observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',refresh);canvas.removeEventListener('webglcontextlost',contextLost);pieces.forEach(p=>p.mesh.geometry.dispose());moteGeometry.dispose();material.dispose();side.dispose();moteMaterials.forEach(m=>m.dispose());renderer.dispose();},
  };
}
