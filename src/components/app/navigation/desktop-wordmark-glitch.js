// Full holds exclude the two 260ms transitions, matching the desktop preview.
export function phaseAt(time){
 const p=time%12520;
 if(p<10000)return {index:0};
 if(p<10260)return {from:0,to:1,t:(p-10000)/260};
 if(p<12260)return {index:1};
 return {from:1,to:0,t:(p-12260)/260};
}
export function riftnFlickerAt(time){
 const hold=time%12520-10260;
 if(hold<0||hold>=2000)return 0;
 return Math.max(0,1-Math.abs(hold-400)/65,1-Math.abs(hold-1360)/90);
}
export function dehubFlickerAt(time){
 const hold=time%12520;
 if(hold>=10000)return 0;
 return .45*Math.max(0,1-Math.abs(hold-2800)/75,1-Math.abs(hold-7300)/95);
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
 const pairs = await Promise.all([false, true].map(mode => Promise.all(sources.map((src, i) => mask(src, i === 1, mode)))));
 let logos = pairs[light ? 1 : 0];
 const tintedPairs = pairs.map(pair => pair.map(logo => ['#71e7ff', '#ab91ff'].map(color => {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 360;
  const x = c.getContext('2d'); x.drawImage(logo, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, 1080, 360); return c;
 })));
 let tinted = tintedPairs[light ? 1 : 0];
  function draw(){
  const phase=phaseAt(elapsed);
  for(const canvas of views){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(canvas.width/1080,canvas.height/360);
   if(phase.index!==undefined||reduce.matches){
    const index=phase.index??phase.to;
    const flicker=reduce.matches?0:(index===0?dehubFlickerAt(elapsed):riftnFlickerAt(elapsed));
    ctx.globalAlpha=1-.24*flicker;
    ctx.drawImage(logos[phase.index??phase.to],0,0);
    if(flicker>0){
     // Sparse signal dips; DEHUB remains quieter than RIFTN.
     const hold=elapsed%12520;
     const y=index===0?(hold<5000?138:218):(hold-10260<900?112:238);
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
    // One compact flash, split-color edge echoes and irregular horizontal tears.
    // The surrounding desktop surface never flashes.
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=.43*energy;
    ctx.drawImage(tinted[current][0],-18*energy,-1*energy);
    ctx.drawImage(tinted[current][1],14*energy,1*energy);
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    const cuts=[0,39,57,98,113,155,174,186,224,261,280,319,360];
    for(let row=0;row<cuts.length-1;row++){
     const y=cuts[row],height=cuts[row+1]-y;
     const threshold=.26+(row*7%11)/28;
     const index=t>threshold?to:from;
     const step=Math.floor(t*6);
     const offset=Math.sin(row*17+step*2.3)*energy*(row%3===0?37:13);
     ctx.drawImage(logos[index],0,y,1080,height,offset,y,1080,height);
    }
    ctx.globalCompositeOperation='screen';ctx.globalAlpha=.42*pulse;
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
  canvas.dataset.wordmarkPhase = phase.index === undefined ? 'transition' : phase.index === 0 ? 'dehub' : 'riftn';
 }
 let previousPhase = '';
 function running() { return !disposed && !reduce.matches && desktop.matches && visible && !document.hidden; }
 function tick(now) {
  frame = 0;
  if (!running()) { last = 0; return; }
  if (last) elapsed += Math.max(0, now - last);
  last = now;
  const phase = phaseAt(elapsed), key = phase.index === undefined ? 'transition' : String(phase.index);
  const flicker = dehubFlickerAt(elapsed) > 0 || riftnFlickerAt(elapsed) > 0;
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
   light = next; logos = pairs[light ? 1 : 0]; tinted = tintedPairs[light ? 1 : 0]; render();
  },
  dispose() {
   disposed = true; cancelAnimationFrame(frame); observer.disconnect();
   document.removeEventListener('visibilitychange', refresh);
   reduce.removeEventListener('change', refresh); desktop.removeEventListener('change', refresh);
   for (const pair of pairs) for (const surface of pair) { surface.width = 0; surface.height = 0; }
   for (const pair of tintedPairs) for (const colors of pair) for (const surface of colors) { surface.width = 0; surface.height = 0; }
  },
 };
}
