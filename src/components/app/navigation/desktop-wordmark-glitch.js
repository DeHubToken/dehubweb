// One 6 s loop. DEHUB rots into blocks in four steps, glitches hard into
// RIFTN, holds, then glitches back and rebuilds block by block.
// Frame indices: 0 DEHUB, 1 RIFTN, 2..5 DEHUB pixel rot steps 1..4.
export const LOOP = 6000;
const STEPS = [
 [0, 1200, 0], [1200, 1700, 2], [1700, 1820, 0], [1820, 2400, 3],
 [2400, 2900, 4], [2900, 3300, 5],
 [3300, 3700, null, 5, 1],
 [3700, 5500, 1],
 [5500, 5760, null, 1, 4],
 [5760, 5880, 3], [5880, 6000, 2],
];
export function phaseAt(time){
 const p=time%LOOP;
 for(const [a,b,index,from,to] of STEPS){
  if(p<a||p>=b)continue;
  return index===null?{from,to,t:(p-a)/(b-a)}:{index};
 }
 return {index:0};
}
export function riftnFlickerAt(time){
 const hold=time%LOOP-3700;
 if(hold<0||hold>=1800)return 0;
 return Math.max(0,1-Math.abs(hold-520)/65,1-Math.abs(hold-1250)/80);
}
export function dehubFlickerAt(){ return 0; }

// Blocky copy of a logo: sampled down without smoothing, alpha snapped hard,
// then a growing share of blocks knocked out like dead pixels.
function pixelate(logo, level){
 const cell=8+level*6, cols=Math.ceil(1080/cell), rows=Math.ceil(360/cell);
 const small=document.createElement('canvas');small.width=cols;small.height=rows;
 const sx=small.getContext('2d',{willReadFrequently:true});sx.drawImage(logo,0,0,cols,rows);
 const data=sx.getImageData(0,0,cols,rows);
 let seed=97;const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
 for(let i=0;i<cols*rows;i++){
  const a=data.data[i*4+3];
  data.data[i*4+3]=a>120&&rnd()>level*.07?255:0;
 }
 sx.putImageData(data,0,0);
 const out=document.createElement('canvas');out.width=1080;out.height=360;
 const ox=out.getContext('2d');ox.imageSmoothingEnabled=false;ox.drawImage(small,0,0,cols*cell,rows*cell);
 // Keep the logo's own shading: clip the original into the block shape.
 ox.globalCompositeOperation='source-in';ox.imageSmoothingEnabled=true;ox.drawImage(logo,0,0);
 // Blocks outside the original's shape still need ink, so lay a flat fill under.
 ox.globalCompositeOperation='destination-over';ox.drawImage(small,0,0,cols*cell,rows*cell);
 return out;
}

async function mask(src,dark,light=false){
 const image=new Image();image.src=src;await image.decode();
 const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
 const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0);
 const data=x.getImageData(0,0,c.width,c.height);let left=c.width,right=0,top=c.height,bottom=0;
 for(let y=0;y<c.height;y++)for(let p=0;p<c.width;p++){
  const i=(y*c.width+p)*4;const brightness=(data.data[i]+data.data[i+1]+data.data[i+2])/3;
  const a=dark?Math.max(0,Math.min(255,(220-brightness)*2)):brightness;
  data.data[i+3]=Math.round(a*data.data[i+3]/255);
  data.data[i]=data.data[i+1]=data.data[i+2]=255;
  if(data.data[i+3]>128){left=Math.min(left,p);right=Math.max(right,p);top=Math.min(top,y);bottom=Math.max(bottom,y)}
 }
 x.putImageData(data,0,0);
 const result=document.createElement('canvas');result.width=1080;result.height=360;
 const ctx=result.getContext('2d');const w=right-left+1,h=bottom-top+1,scale=Math.min(1000/w,290/h);
 const dw=w*scale,dh=h*scale,dx=(1080-dw)/2,dy=(360-dh)/2;
 ctx.shadowColor=light?'transparent':'rgba(0,0,0,.38)';ctx.shadowBlur=12;ctx.shadowOffsetY=9;
 ctx.drawImage(c,left,top,w,h,dx,dy+3,dw,dh);ctx.shadowColor='transparent';
 ctx.drawImage(c,left,top,w,h,dx,dy,dw,dh);
 ctx.globalCompositeOperation='source-atop';
 const gradient=ctx.createLinearGradient(0,dy,0,dy+dh);gradient.addColorStop(0,light?'#252932':'#ffffff');gradient.addColorStop(.65,light?'#20242b':'#f4f5f7');gradient.addColorStop(.96,light?'#181c23':'#e5e7eb');gradient.addColorStop(1,light?'#11151b':'#afb5bf');ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,360);
 return result;
}


/** @param {HTMLCanvasElement} canvas
 * @param {string[]} sources
 * @param {{ light?: boolean }} options
 */
export async function createDesktopGlitch(canvas, sources, options = {}) {
 const views = [canvas];
 const reduce = matchMedia('(prefers-reduced-motion: reduce)');
 const desktop = matchMedia('(min-width: 1024px)');
 let elapsed = 0, last = 0, frame = 0, disposed = false, visible = true;
 let light = options.light ?? false;
 const masks = await Promise.all([false, true].map(mode => Promise.all(sources.map((src, i) => mask(src, i === 1, mode)))));
 const frameSets = [null, null];
 function framesFor(mode) {
  const key = mode ? 1 : 0;
  if (frameSets[key]) return frameSets[key];
  const [dehub, riftn] = masks[key];
  const logos = [dehub, riftn, ...[1, 2, 3, 4].map(level => pixelate(dehub, level))];
  // Colour echoes only for frames the glitch uses: DEHUB, RIFTN, rot step 3 and 4.
  const tinted = logos.map((logo, i) => i === 2 || i === 3 ? null : ['#71e7ff', '#ab91ff'].map(color => {
   const c = document.createElement('canvas'); c.width = 1080; c.height = 360;
   const x = c.getContext('2d'); x.drawImage(logo, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, 1080, 360); return c;
  }));
  return (frameSets[key] = { logos, tinted });
 }
 let { logos, tinted } = framesFor(light);
  function draw(){
  const phase=phaseAt(elapsed);
  for(const canvas of views){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(canvas.width/1080,canvas.height/360);
   if(phase.index!==undefined||reduce.matches){
    const index=phase.index??phase.to;
    const flicker=reduce.matches?0:(index===0?dehubFlickerAt(elapsed):riftnFlickerAt(elapsed));
    ctx.globalAlpha=1-.24*flicker;
    ctx.drawImage(logos[phase.index??phase.to],0,0);
    if(flicker>0){
     // Two sparse signal dips while RIFTN holds.
     const y=elapsed%LOOP-3700<900?112:238;
     ctx.clearRect(0,y,1080,8);
     ctx.drawImage(logos[index],0,y,1080,8,7*flicker,y,1080,8);
     ctx.globalCompositeOperation='screen';ctx.globalAlpha=.17*flicker;
     ctx.drawImage(tinted[index][0],-4*flicker,0);
     ctx.globalCompositeOperation='source-over';
    }
    ctx.globalAlpha=1;
   }
   else{
    const {from,to,t}=phase;
    const energy=Math.pow(Math.sin(Math.PI*t),1.5);
    const pulse=Math.exp(-Math.pow((t-.43)/.18,2));
    const current=t<.43?from:to;
    // Hit harder on the way into RIFTN than on the way back.
    const k=to===1?1.7:1;
    // One compact flash, split-color edge echoes and irregular horizontal tears.
    // The surrounding desktop surface never flashes.
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=Math.min(.75,.43*k*energy);
    ctx.drawImage(tinted[current][0],-18*k*energy,-1*energy);
    ctx.drawImage(tinted[current][1],14*k*energy,1*energy);
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    const cuts=[0,39,57,98,113,155,174,186,224,261,280,319,360];
    for(let row=0;row<cuts.length-1;row++){
     const y=cuts[row],height=cuts[row+1]-y;
     const threshold=.26+(row*7%11)/28;
     const index=t>threshold?to:from;
     const step=Math.floor(t*(to===1?9:6));
     const offset=Math.sin(row*17+step*2.3)*energy*k*(row%3===0?37:13);
     ctx.drawImage(logos[index],0,y,1080,height,offset,y,1080,height);
    }
    ctx.globalCompositeOperation='screen';ctx.globalAlpha=Math.min(.8,.42*k*pulse);
    ctx.shadowColor='#c6efff';ctx.shadowBlur=24*pulse;
    ctx.drawImage(logos[current],0,0);ctx.shadowBlur=0;
    // A narrow travelling highlight is clipped to the incoming letterforms.
    const sweep=-100+t*1280;
    ctx.save();ctx.beginPath();ctx.rect(sweep,0,42,360);ctx.clip();
    ctx.globalAlpha=.65*energy;ctx.drawImage(tinted[to][0],0,0);ctx.restore();
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
   }
   ctx.restore();
  }
 }

 function render() {
  draw();
  const phase = phaseAt(elapsed);
  canvas.dataset.wordmarkPhase = phase.index === undefined ? 'transition' : phase.index === 1 ? 'riftn' : 'dehub';
 }
 let previousPhase = '';
 function running() { return !disposed && !reduce.matches && desktop.matches && visible && !document.hidden; }
 function tick(now) {
  frame = 0;
  if (!running()) { last = 0; return; }
  if (last) elapsed += Math.max(0, now - last);
  last = now;
  const phase = phaseAt(elapsed), key = phase.index === undefined ? 'transition' : String(phase.index);
  const flicker = riftnFlickerAt(elapsed) > 0;
  const renderKey = key + (flicker ? '-flicker' : '');
  if (renderKey !== previousPhase || key === 'transition' || flicker) { render(); previousPhase = renderKey; }
  frame = requestAnimationFrame(tick);
 }
 function refresh() {
  cancelAnimationFrame(frame); frame = 0; last = 0;
  if (reduce.matches) { elapsed = 0; previousPhase = ''; render(); }
  if (running()) frame = requestAnimationFrame(tick);
 }
 const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; refresh(); });
 observer.observe(canvas);
 document.addEventListener('visibilitychange', refresh);
 reduce.addEventListener('change', refresh);
 desktop.addEventListener('change', refresh);
 render(); refresh();
 return {
  setLight(next) {
   if (disposed || light === next) return;
   light = next; ({ logos, tinted } = framesFor(light)); render();
  },
  dispose() {
   disposed = true; cancelAnimationFrame(frame); observer.disconnect();
   document.removeEventListener('visibilitychange', refresh);
   reduce.removeEventListener('change', refresh); desktop.removeEventListener('change', refresh);
   for (const pair of masks) for (const surface of pair) { surface.width = 0; surface.height = 0; }
   for (const set of frameSets) if (set) {
    for (const surface of set.logos) { surface.width = 0; surface.height = 0; }
    for (const colors of set.tinted) if (colors) for (const surface of colors) { surface.width = 0; surface.height = 0; }
   }
  },
 };
}
