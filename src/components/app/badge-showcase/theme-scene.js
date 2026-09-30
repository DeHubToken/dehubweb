import { ICE_SHELL } from './theme-ice';

/** Canvas scenes shared by the web showcase and the offline mobile runtime. */
export const BADGE_WORLDS = [{"id": "cosmic", "color": "#a9d5ff", "bg": "#03060c"}, {"id": "winter", "color": "#c9f1ff", "bg": "#07121d"}, {"id": "jungle", "color": "#b5cb80", "bg": "#09110c"}, {"id": "hazy", "color": "#d5baf2", "bg": "#130e1c"}, {"id": "swarms", "color": "#9cdeec", "bg": "#061014"}, {"id": "lavalamp", "color": "#ffc089", "bg": "#170907"}, {"id": "island", "color": "#aceee1", "bg": "#081c25"}, {"id": "horror", "color": "#e4b5ac", "bg": "#100a0c"}, {"id": "war", "color": "#8be6df", "bg": "#081211"}, {"id": "hacker", "color": "#83e5a4", "bg": "#030b06"}];

export function createBadgeScene(canvas, theme) {
const c=canvas.getContext('2d');
if(!c) throw new Error('Badge canvas unavailable');
const selected=BADGE_WORLDS.find(w=>w.id===theme);
if(!selected) throw new Error('Unknown badge world');
let frameTime=0;
let mode='click',active=true,W=1,H=1,D=1,CX=0,CY=0,sourceBox=null;
let shardCells=[],glintCanvas=null,frostCanvas=null,bloodArt=[],tideArt=[];
let lavaSurface=null,lavaPixels=null;
let smokeClouds=[];
let art=[],planets=[],ice=null,mask=[],fractures=[],frozen=[],pixels=[];
const TAU=Math.PI*2;
const sat=x=>Math.max(0,Math.min(1,x)),lerp=(a,b,t)=>a+(b-a)*t,out=x=>1-Math.pow(1-sat(x),3),smooth=x=>{x=sat(x);return x*x*(3-2*x)},inout=x=>{x=sat(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2},range=(t,a,b)=>sat((t-a)/(b-a)),rnd=i=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n)},world=()=>selected,duration=()=>mode==='click'?3.3:6.5;
function off(size=512){const q=document.createElement('canvas');q.width=q.height=size;return q;}
function stroke(points,col,width=1){c.strokeStyle=col;c.lineWidth=width;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.stroke();}
function glow(x,y,r,col,alpha=1){if(r<=0||alpha<=0)return;c.save();c.globalAlpha*=alpha;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,col);g.addColorStop(1,col.slice(0,7)+'00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();}
function badge(index,x=CX,y=CY,size=D,angle=0,alpha=1,sx=1,sy=1,filter='none'){if(size<.2||alpha<=0)return;c.save();c.translate(x,y);c.rotate(angle);c.scale(sx,sy);c.globalAlpha*=sat(alpha);c.filter=filter;c.shadowColor='#0008';c.shadowBlur=18;c.shadowOffsetY=10;c.drawImage(art[index],-size/2,-size/2,size,size);c.restore();}
function layer(im,x,y,size,alpha=1,rot=0){if(!im||alpha<=0||size<=0)return;c.save();c.globalAlpha*=sat(alpha);c.translate(x,y);c.rotate(rot);c.drawImage(im,-size/2,-size/2,size,size);c.restore();}
function origin(){return sourceBox?{x:sourceBox.x+sourceBox.size/2,y:sourceBox.y+sourceBox.size/2,size:sourceBox.size}:{x:CX,y:CY,size:D*.22};}
function lift(index,t,extra=0){const o=origin(),p=out(t/.95);badge(index,lerp(o.x,CX,p),lerp(o.y,CY,p)-Math.sin(p*Math.PI)*25,lerp(origin().size,D,p),-.09*Math.sin(p*Math.PI)+extra,1,1-.08*Math.sin(p*Math.PI));}
function makePlanet(kind){const q=off(384),g=q.getContext('2d'),data=g.createImageData(384,384);for(let y=0;y<384;y++)for(let x=0;x<384;x++){const nx=(x-192)/187,ny=(y-192)/187,r=nx*nx+ny*ny;if(r>1)continue;const z=Math.sqrt(1-r),light=Math.max(0,-nx*.62-ny*.42+z*.6),lon=Math.atan2(nx,z),lat=Math.asin(ny);const bands=Math.sin(lat*38+Math.sin(lon*7)*1.2)+.3*Math.sin(lat*93+lon*17);const cloud=Math.pow(Math.max(0,Math.sin(lon*13+Math.sin(lat*16))*Math.cos(lat*21+lon*3)),3);const shade=.045+Math.pow(light,1.2)*.95,rim=Math.pow(1-z,5)*Math.max(0,light)*.8;const base=kind===0?[23+cloud*140,66+cloud*125,106+cloud*110]:[116+bands*13,82+bands*10,53+bands*8];const i=(y*384+x)*4;data.data[i]=Math.min(255,base[0]*shade+rim*60);data.data[i+1]=Math.min(255,base[1]*shade+rim*140);data.data[i+2]=Math.min(255,base[2]*shade+rim*230);data.data[i+3]=Math.min(255,(1-r)*18000);}g.putImageData(data,0,0);return q;}
function bg(t){c.fillStyle=world().bg;c.fillRect(0,0,W,H);if(world().id==='cosmic'){const travel=mode==='promotion'?inout(range(t,1.7,4.5)):0;const alpha=active?out(t/.8):.25;c.save();c.globalAlpha=alpha;layer(planets[0],W*.18-travel*W*.25,H*.84+travel*H*.5,Math.min(W*.48,260)*(1+travel*.4));c.save();c.translate(W*.83-travel*45,H*.2+travel*30);c.rotate(-.35);c.strokeStyle='#ba927b44';c.lineWidth=7;c.beginPath();c.ellipse(0,0,64,19,0,Math.PI,TAU);c.stroke();layer(planets[1],0,0,63);c.beginPath();c.ellipse(0,0,64,19,0,0,Math.PI);c.stroke();c.restore();c.restore();}else{glow(CX,CY,W*.65,world().color+'10');if(['winter','island'].includes(world().id)){const gr=c.createLinearGradient(0,H*.7,0,H);gr.addColorStop(0,'#00000000');gr.addColorStop(1,world().color+'14');c.fillStyle=gr;c.fillRect(0,H*.7,W,H*.3);}}}
function sparkle(x,y,r,a=1,col='#d8eeff'){c.save();c.globalAlpha*=a;stroke([[x-r,y],[x+r,y]],col,.7);stroke([[x,y-r],[x,y+r]],col,.7);c.restore();}
function ring(x,y,r,alpha=1,col=world().color,flat=.28){c.save();c.globalAlpha*=sat(alpha);c.strokeStyle=col;c.lineWidth=.8;c.beginPath();c.ellipse(x,y,r,r*flat,0,0,TAU);c.stroke();c.restore();}
function starfield(t,power){const fade=1-smooth(range(frameTime,duration()-.6,duration()));const q=range(t,2.1,4.8),travel=t*.018+(1-Math.cos(q*Math.PI))*.19;c.save();c.globalCompositeOperation='screen';for(let i=0;i<240;i++){const a=rnd(i+1)*TAU,z=(rnd(i+9)+travel)%1,r=16+Math.pow(z,2)*Math.max(W,H)*.83,x=CX+Math.cos(a)*r,y=CY+Math.sin(a)*r*.78,len=Math.min(90,power*(3+z*44));c.globalAlpha=fade*(.12+z*.68)*Math.min(1,z*12);if(len<1){c.fillStyle=i%11?'#b2d8ef':'#fff';c.beginPath();c.arc(x,y,.4+z*.55,0,TAU);c.fill();}else stroke([[x,y],[x+Math.cos(a)*len,y+Math.sin(a)*len*.78]],i%8?'#b2d8ef':'#fff',i%7?.65:1.05);}c.restore();}
function exhaust(x,y,length,angle,alpha){c.save();c.translate(x,y);c.rotate(angle);c.globalCompositeOperation='screen';c.globalAlpha*=sat(alpha);const g=c.createLinearGradient(0,0,0,length);g.addColorStop(0,'#ffffff');g.addColorStop(.12,'#b5edffcc');g.addColorStop(.42,'#56b4ff65');g.addColorStop(1,'#267aff00');c.fillStyle=g;c.beginPath();c.moveTo(-11,0);c.bezierCurveTo(-16,length*.25,-5,length*.8,0,length);c.bezierCurveTo(5,length*.8,16,length*.25,11,0);c.fill();glow(0,0,35,'#b5e9ff',.7);c.restore();}
function cosmic(t){const old=0;starfield(t,mode==='promotion'?Math.sin(range(t,2.1,4.8)*Math.PI)*1.8:.1);if(mode==='click'){lift(1,t,-.055*Math.sin(t*1.5)*Math.exp(-t));if(t>.85){ring(CX,CY+D*.48,D*.6,out((t-.85)/.4)*(1-range(t,2.1,3.2)),'#92cafa',.25);}return;}
if(t<1.4){lift(old,t);const e=range(t,.9,1.4);exhaust(CX,CY+D*.36,30+70*e,0,e*.6);}
else if(t<2.8){const p=range(t,1.4,2.8),acc=p*p*p;const x=CX+acc*W*.48,y=CY+Math.sin(p*Math.PI)*16-acc*(H*.7),s=D*(1-.8*acc),a=acc*.8;exhaust(x-Math.sin(a)*s*.35,y+Math.cos(a)*s*.35,80+acc*400,a,1-p*.5);badge(0,x,y,s,a,1-range(p,.85,1));}
else if(t<3.45){glow(W*.93,-H*.05,100,'#b5edff',1-range(t,2.8,3.25));}
else{const p=out(range(t,3.45,5.75)),s=lerp(8,D,p),x=lerp(CX-W*.32,CX,p),y=lerp(CY-H*.25,CY,p)+Math.sin(p*Math.PI)*30;exhaust(x,y+s*.35,170*(1-p),-.18*(1-p),(1-p)*.7);badge(1,x,y,s,-.35*(1-p),sat((t-3.45)*3),1-.22*(1-p));if(t>5.1)ring(CX,CY+D*.5,D*(.5+range(t,5.1,6.3)*.35),(1-range(t,5.1,6.3))*.35);}}
function crack(progress,size=D*1.15,red=false){c.save();c.translate(CX,CY);c.scale(size/512,size/512);c.lineCap='round';for(let i=0;i<fractures.length;i++){const pts=fractures[i],end=Math.max(0,Math.min(pts.length,(progress*1.6-i/16)*pts.length));if(end<1)continue;const path=pts.slice(0,Math.ceil(end));stroke(path,red?'#eac1b5':'#e3fbff',2);stroke(path,red?'#602020':'#3e719b',.7);}c.restore();}
function frost(index,p){badge(index);const f=frostCanvas,g=f.getContext('2d');g.clearRect(0,0,512,512);g.globalCompositeOperation='source-over';g.drawImage(ice,0,0,512,512);g.globalCompositeOperation='destination-in';const edge=1-out(p),gradient=g.createRadialGradient(256,256,Math.max(0,edge*200-65),256,256,Math.max(1,edge*250+20));gradient.addColorStop(0,'#ffffff00');gradient.addColorStop(1,'#ffffffff');g.fillStyle=gradient;g.fillRect(0,0,512,512);g.globalCompositeOperation='source-over';layer(f,CX,CY,D*1.5,smooth(p/.35)*.96);c.save();c.globalAlpha=sat(p)*.13;c.globalCompositeOperation='screen';layer(mask[index],CX,CY,D,1);c.restore();for(let i=0;i<42;i++){const a=i*2.4,r=D*(.58-.46*range(p,i/100,.6+i/100));if(p>i/60)sparkle(CX+Math.cos(a)*r,CY+Math.sin(a)*r,1+rnd(i)*2,Math.sin(sat(p-i/60)*Math.PI)*.35);}}
function makeShards(){const seeds=Array.from({length:48},(_,i)=>[(rnd(i*2+7)-.5)*512,(rnd(i*2+8)-.5)*512]);return seeds.map((o,i)=>{let poly=[[-256,-256],[256,-256],[256,256],[-256,256]];for(let j=0;j<seeds.length&&poly.length;j++){if(i===j)continue;const q=seeds[j],nx=q[0]-o[0],ny=q[1]-o[1],d=(q[0]*q[0]+q[1]*q[1]-o[0]*o[0]-o[1]*o[1])/2,next=[];for(let k=0;k<poly.length;k++){const a=poly[k],b=poly[(k+1)%poly.length],da=a[0]*nx+a[1]*ny-d,db=b[0]*nx+b[1]*ny-d;if(da<=0)next.push(a);if((da<=0)!==(db<=0)){const t=da/(da-db);next.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t)]);}}poly=next;}const centre=poly.reduce((a,b)=>[a[0]+b[0]/poly.length,a[1]+b[1]/poly.length],[0,0]);return{poly,x:centre[0],y:centre[1],spin:(rnd(i+91)-.5)*5,depth:rnd(i+17),i};});}
function shatter(im,p,inward=false){const k=D*(im===art[0]?1:1.45)/512,alpha=1-smooth(range(p,.65,1));c.save();c.globalAlpha*=alpha;for(const cell of shardCells){const{x:ox,y:oy,poly,spin,depth,i}=cell,delay=rnd(i+91)*.035,u=sat((p-delay)/(1-delay)),speed=.85+depth*2.5,dist=inward?-inout(u)*.98:(1-Math.exp(-u*3))*speed,scale=inward?1-u*.9:1+Math.sin(u*Math.PI)*(depth-.5)*.55;c.save();c.translate(CX+ox*k*(1+dist),CY+oy*k*(1+dist)+(inward?0:u*u*(100+depth*90)));c.rotate(spin*u);c.scale(k*scale*Math.max(.17,Math.abs(Math.cos(u*spin*.8))),k*scale);c.translate(-ox,-oy);c.beginPath();poly.forEach((v,j)=>j?c.lineTo(...v):c.moveTo(...v));c.closePath();c.clip();c.drawImage(im,-256,-256,512,512);if(p>0&&p<.65){c.globalCompositeOperation='screen';c.fillStyle='#ccedff';c.globalAlpha*=Math.max(0,Math.sin(u*8+i))*u*.3;c.fillRect(-256,-256,512,512);}c.restore();}c.restore();}
function fractureLines(p){c.save();c.translate(CX,CY);c.scale(D*1.45/512,D*1.45/512);c.globalAlpha=smooth(p)*.7;c.lineWidth=1;for(const cell of shardCells){if(rnd(cell.i+12)>p)continue;const pts=cell.poly.concat([cell.poly[0]]);stroke(pts,'#dffaff',1);}c.restore();}
function finishingLight(t){const begin=mode==='promotion'?5.55:2.45,p=range(t,begin,begin+.8);if(p<=0||p>=1)return;const g=glintCanvas.getContext('2d');g.clearRect(0,0,256,256);g.globalCompositeOperation='source-over';g.drawImage(art[1],0,0,256,256);g.globalCompositeOperation='source-in';const x=lerp(-100,400,p),gr=g.createLinearGradient(x-45,0,x+45,40);gr.addColorStop(0,'#ffffff00');gr.addColorStop(.45,'#ffffff00');gr.addColorStop(.53,'#fff9dd88');gr.addColorStop(.63,'#ffffff00');gr.addColorStop(1,'#ffffff00');g.fillStyle=gr;g.fillRect(0,0,256,256);g.globalCompositeOperation='source-over';c.save();c.globalCompositeOperation='screen';layer(glintCanvas,CX,CY,D,.38*Math.sin(p*Math.PI));c.restore();}
function atmosphere(t){const id=world().id,life=mode==='promotion'?Math.sin(range(t,.5,6.2)*Math.PI):Math.sin(range(t,.3,3.2)*Math.PI);if(life<=0)return;c.save();if(id==='winter'){for(let i=0;i<52;i++){const x=rnd(i+301)*W+Math.sin(t*.55+i)*9,y=(rnd(i+403)*H+t*(7+rnd(i)*11))%H;c.globalAlpha=life*(.07+rnd(i+101)*.2);c.fillStyle='#d3f5ff';c.beginPath();c.arc(x,y,.5+rnd(i+208)*1.2,0,TAU);c.fill();}}if(id==='jungle'){for(let i=0;i<14;i++)glow(rnd(i+330)*W+Math.sin(t+i)*12,H*.25+rnd(i+480)*H*.5+Math.cos(t*.7+i)*14,3,'#ddeb9a',life*(.04+.14*Math.pow(Math.sin(t*.7+i),2)));}if(id==='lavalamp')glow(CX,CY+D*.45,D*.8,'#d75a25',life*.035);if(id==='hazy'){glow(CX-D*.5,CY+20,D*.75,'#b299dc',life*.035);glow(CX+D*.45,CY-20,D*.65,'#8fc1d9',life*.025);}if(id==='island'){c.globalAlpha=life*.09;c.beginPath();c.rect(0,CY+D*.45,W,H);c.clip();for(let i=0;i<12;i++){const pts=[];for(let x=0;x<W;x+=8)pts.push([x,CY+D*.5+i*15+Math.sin(x*.023+t+i)*8]);stroke(pts,'#94ffe8',1);}}c.restore();}
function mist(t,alpha,color='#c9e7f4',spread=1){c.save();c.globalCompositeOperation='screen';for(let i=0;i<24;i++){const x=CX+(rnd(i+100)-.5)*D*2.1*spread+Math.sin(t*.4+i)*15,y=CY+(rnd(i+160)-.5)*D*.55-(t%10)*4,r=25+rnd(i+190)*50;glow(x,y,r,color,sat(alpha)*(.025+rnd(i)*.03));}c.restore();}
function winter(t){if(mode==='click'){if(t<.95)lift(1,t);else{frost(1,Math.sin(range(t,.95,3.1)*Math.PI)*.72);mist(t,Math.sin(range(t,.9,3)*Math.PI)*.6);}return;}if(t<1.05){lift(0,t);}else if(t<2.75){frost(0,range(t,1.05,2.4));mist(t,range(t,1.05,2));if(t>2.05){crack(range(t,2.05,2.75));fractureLines(range(t,2.25,2.75));}}else if(t<4.8){const p=range(t,2.75,4.8);badge(1,CX,CY,D*(.94+.06*out(p)),0,out(p*3));shatter(frozen[0],p);mist(t,(1-p)*1.2, '#d8f4ff',1+p);}else{badge(1);mist(t,(1-range(t,4.8,6))*.35);}}
function leaf(x,y,size,angle,alpha=1){c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha*=alpha;const g=c.createLinearGradient(-size,0,size,0);g.addColorStop(0,'#1a3921');g.addColorStop(.5,'#9fae60');g.addColorStop(1,'#35532d');c.fillStyle=g;c.beginPath();c.moveTo(-size,0);c.quadraticCurveTo(0,-size*.8,size,0);c.quadraticCurveTo(0,size*.4,-size,0);c.fill();stroke([[-size*.8,0],[size*.8,0]],'#afc48577',.7);c.restore();}
function vines(p,t,wrap=1){p*=1-smooth(range(t,duration()-.55,duration()));for(let j=0;j<3;j++){const pts=[];for(let k=0;k<80*p;k++){const a=k*.066+j*TAU/3-1.3,r=D*(.58-k*.0015)*wrap;pts.push([CX+Math.cos(a)*r,CY+Math.sin(a)*r]);}if(pts.length)stroke(pts,'#70905e',2);for(let k=4;k<80*p;k+=12){const a=k*.066+j*TAU/3-1.3,r=D*(.58-k*.0015)*wrap;leaf(CX+Math.cos(a)*r,CY+Math.sin(a)*r,9*out((80*p-k)/8),a+Math.sin(t)*.05);}}}
function jungle(t){if(mode==='click'){lift(1,t,.12*Math.sin(t*5)*Math.exp(-t*1.8));vines(out(range(t,.5,2)),t);return;}if(t<1.8){lift(0,t);vines(range(t,.8,1.8),t);}else if(t<3.15){const p=inout(range(t,1.8,3.15));badge(0,CX,CY+50*p,D*(1-p),-.3*p,1-p);vines(1,t,1-p*.85);glow(CX,CY+25,45,'#c2df75',Math.sin(p*Math.PI)*.13);}else{const p=out(range(t,3.15,5.5));badge(1,CX,CY+60*(1-p),D*p,.14*Math.sin(p*Math.PI),p);vines(p,t);for(let i=0;i<20;i++){const q=range(t,3.15+i*.035,5.8+i*.02);leaf(CX+Math.sin(i*2.4)*D*q,CY+60-D*q+q*q*D*1.1,3+rnd(i)*5,i+q*2,(1-q)*p);}}}
function makeSmokeCloud(seed) {
  const q=off(192),g=q.getContext('2d'),im=g.createImageData(192,192);
  const grid=Array.from({length:1024},(_,i)=>rnd(i+seed*1301));
  const noise=(x,y)=>{
    const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
    const at=(a,b)=>grid[(a&31)+(b&31)*32];
    return lerp(lerp(at(ix,iy),at(ix+1,iy),fx),lerp(at(ix,iy+1),at(ix+1,iy+1),fx),fy);
  };
  for(let y=0;y<192;y++)for(let x=0;x<192;x++){
    const nx=(x-95.5)/96,ny=(y-95.5)/96,r=nx*nx+ny*ny;
    if(r>=1)continue;
    const curl=noise(nx*2+12,ny*2+12)*2.8;
    const u=nx*3+12+Math.sin(ny*3+curl)*.9,v=ny*3+12+Math.cos(nx*3-curl)*.7;
    const f=noise(u,v)*.56+noise(u*2.1,v*2.1)*.28+noise(u*4.3,v*4.3)*.16;
    const density=smooth(range(f,.2,.8))*Math.pow(1-r,1.5);
    const k=(y*192+x)*4;
    im.data[k]=82+f*86+seed*4;im.data[k+1]=74+f*76;im.data[k+2]=110+f*99;
    im.data[k+3]=density*235;
  }
  g.putImageData(im,0,0);return q;
}
function smokeVeil(t,power,front=false,x=CX,y=CY,size=D) {
  if(power<=0)return;
  c.save();
  const count=front?12:16;
  for(let i=0;i<count;i++){
    const seed=i+(front?91:17),direction=i%2?1:-1;
    const drift=Math.sin(t*.38+seed)*.28;
    const px=x+size*((rnd(seed+4)-.5)*1.9+drift*direction);
    const py=y+size*((rnd(seed+80)-.5)*1.25+Math.sin(t*.28+seed)*.12);
    const scale=size*(.95+rnd(seed+140)*.85)*(1+.08*Math.sin(t*.7+seed));
    layer(smokeClouds[i%3],px,py,scale,power*(front?.72:.52),seed+t*.07*direction);
  }
  if(!front){
    c.globalCompositeOperation='screen';
    glow(x-size*.22,y-size*.2,size*.8,'#ae8cd9',power*.11);
    glow(x+size*.35,y+size*.08,size*.65,'#80a6bd',power*.055);
  }else{
    for(let i=0;i<10;i++){
      const px=x+(rnd(i+780)-.5)*size*1.9+Math.sin(t*.35+i)*size*.025;
      const py=y+(rnd(i+820)-.5)*size*1.5-Math.sin(t*.28+i)*size*.08;
      glow(px,py,1.2+rnd(i+840)*1.5,'#ddd0f2',power*(.12+.18*Math.pow(Math.sin(t*.65+i),2)));
    }
  }
  c.restore();
}
function hazy(t) {
  const haze=smooth(range(t,.2,1.5))*(1-smooth(range(t,4.55,6.45)));
  smokeVeil(t,haze*1.2);
  if(t<1.1)lift(0,t);
  else if(t<3.25){
    const p=smooth(range(t,1.1,3.25));
    badge(0,CX+Math.sin(p*Math.PI)*D*.035,CY-D*.1*p,D*(1+.045*p),-.045*p,
      1-p,1,1,`blur(${p*7}px)`);
  }else if(t>=3.5){
    const p=smooth(range(t,3.5,5.95));
    badge(1,CX,CY+D*.09*(1-p),D*(.92+.08*p),.04*(1-p),p,1,1,`blur(${(1-p)*6}px)`);
  }
  smokeVeil(t+1.7,haze*1.35,true);
}
function flock(t,p){const old=pixels[0],next=pixels[1];if(!old.length||!next.length){badge(1);return;}const m=inout(p),swirl=Math.pow(Math.sin(p*Math.PI),2);c.save();const parentAlpha=c.globalAlpha;for(let i=0;i<Math.max(old.length,next.length);i++){const a=old[i%old.length],b=next[(i*37)%next.length],ang=i*2.399+t*.8,r=swirl*(.15+rnd(i)*.7);const x=CX+(lerp(a.x,b.x,m)+Math.cos(ang)*r)*D,y=CY+(lerp(a.y,b.y,m)+Math.sin(ang)*r*.65)*D;const red=Math.round(lerp(a.r,b.r,m)),green=Math.round(lerp(a.g,b.g,m)),blue=Math.round(lerp(a.b,b.b,m));c.fillStyle=`rgb(${red},${green},${blue})`;c.globalAlpha=parentAlpha*.9;const size=1.1+(1-swirl)*2.8;c.fillRect(x-size/2,y-size/2,size,size);if(swirl>.1&&i%3===0){c.globalAlpha=parentAlpha*swirl*.2;stroke([[x,y],[x-Math.cos(ang)*10*swirl,y-Math.sin(ang)*10*swirl]],'#c1f4ff',.7);}}c.restore();}
function swarms(t){if(mode==='click'){if(t<1)lift(1,t);else{const p=Math.sin(range(t,1,3.2)*Math.PI)*.18;badge(1,CX,CY,D,0,1-p*3);c.save();c.globalAlpha=p*3;flock(t,1-p*.2);c.restore();}return;}if(t<1.2){lift(0,t);}else if(t<4.9){const p=range(t,1.2,4.9);badge(0,CX,CY,D,0,1-range(p,0,.15));c.save();c.globalAlpha=smooth(range(p,0,.13))*(1-smooth(range(p,.88,1)));flock(t,p);c.restore();badge(1,CX,CY,D,0,range(p,.85,1));}else badge(1);}
function wax(x,y,rx,ry,alpha=1){c.save();c.globalAlpha*=alpha;const g=c.createRadialGradient(x-rx*.2,y-ry*.3,1,x,y,Math.max(rx,ry));g.addColorStop(0,'#ffdc97');g.addColorStop(.25,'#ff9a46');g.addColorStop(.8,'#bc431f');g.addColorStop(1,'#632415');c.fillStyle=g;c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);c.fill();c.restore();}
function moltenLiquid(t) {
  const born=smooth(range(t,.65,1.45)),drain=smooth(range(t,3.45,5.8));
  const cover=smooth(range(t,1.05,2.75))*(1-drain);
  const life=born*(1-smooth(range(t,5.5,6.25)));
  if(life<=0)return;
  // An implicit liquid surface joins lobes into necks and separates droplets.
  // A reused low-resolution material keeps the same motion affordable on phones.
  const blobs=[
    [0,.65,.46,.13],
    [Math.sin(t*1.1)*.045,.66-cover*.7,.045+cover*.54,.045+cover*.59],
    [-.29+Math.sin(t*.9)*.045,.54-cover*.86,.065+cover*.17,.075+cover*.24],
    [.3+Math.cos(t*.8)*.05,.5-cover*.6,.055+cover*.17,.065+cover*.22],
  ];
  for(let i=0;i<4;i++){
    const u=range(t,1.05+i*.15,4.9+i*.16),pulse=Math.sin(u*Math.PI);
    blobs.push([Math.sin(i*2.4+t*.5)*(.66+drain*.18),.65-u*1.4+drain*.8,
      .035+pulse*.075,.045+pulse*.105]);
  }
  for(const b of blobs){b[2]=1/b[2];b[3]=1/b[3];}
  const n=lavaSurface.width,data=lavaPixels.data;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const px=(x+.5)/n*2.4-1.2,py=(y+.5)/n*2.4-1.2;
    let field=0,gx=0,gy=0;
    for(const b of blobs){
      const dx=(px-b[0])*b[2],dy=(py-b[1])*b[3],den=.015+dx*dx+dy*dy,v=1/den;
      field+=v;gx+=dx*v*v*b[2];gy+=dy*v*v*b[3];
    }
    const length=Math.sqrt(gx*gx+gy*gy)+.001;
    const k=(y*n+x)*4,alpha=sat(.5+(field-1)/Math.max(.04,length*4.8/n));
    data[k+3]=255*alpha;
    if(!alpha)continue;
    const nx=gx/length,ny=gy/length;
    const rim=1-smooth(range(field,1,2.1));
    const light=sat(.65-py*.18+rim*(-nx*.2-ny*.3));
    const shine=Math.pow(Math.max(0,-nx*.55-ny*.83),7)*rim;
    const heat=(.5+.5*Math.sin(py*4.5-t*.8+Math.sin(px*5+t*.65)))*(1-rim);
    data[k]=224+light*26+shine*20;
    data[k+1]=48+light*62+heat*20+shine*95;
    data[k+2]=12+light*16+heat*7+shine*50;
  }
  lavaSurface.getContext('2d').putImageData(lavaPixels,0,0);
  c.save();c.globalAlpha=life;c.imageSmoothingEnabled=true;
  c.drawImage(lavaSurface,CX-D*1.2,CY-D*1.2,D*2.4,D*2.4);c.restore();
}
function meltingBadge(t) {
  const melt=smooth(range(t,1.8,3.15));
  if(!melt){badge(0);return;}
  c.save();c.globalAlpha=1-smooth(range(t,2.85,3.2));
  // Stretch the actual artwork downward as the hot liquid envelops it.
  for(let row=0;row<512;row+=8){
    const y=row/512,pull=melt*y*y;
    const width=D*(1+pull*.22),x=CX-width/2+Math.sin(y*8+t*2)*D*.018*melt;
    c.drawImage(art[0],0,row,512,8,x,CY-D/2+y*D+pull*D*.36,width,D/64*(1+melt*y*.75)+.5);
  }
  c.restore();
}
function lava(t) {
  if(t<1.05)lift(0,t);
  else if(t<3.2)meltingBadge(t);
  else{
    const p=smooth(range(t,3.2,5.8)),wobble=Math.sin(p*TAU)*Math.sin(p*Math.PI)*.025;
    badge(1,CX,CY+D*.1*(1-p),D*(.96+.04*p),0,1,1+wobble,1-wobble);
  }
  glow(CX,CY+D*.45,D*.85,'#f58024',Math.sin(range(t,.65,6.25)*Math.PI)*.1);
  moltenLiquid(t);
}
function underwater(t) {
  const life=smooth(range(t,.55,1.6))*(1-smooth(range(t,5.3,6.3)));
  if(life<=0)return;
  c.save();c.globalCompositeOperation='screen';
  // Soft shafts and suspended specks establish depth without a surface wipe.
  for(let i=0;i<4;i++){
    const x=CX+D*(i-.9)*.48+Math.sin(t*.3+i)*D*.04;
    const top=CY-D*1.3,bottom=CY+D*.9;
    const beam=c.createLinearGradient(x,top,x,bottom);
    beam.addColorStop(0,'#a8eee91c');beam.addColorStop(1,'#69bdb900');
    c.globalAlpha=life*.48;c.fillStyle=beam;c.beginPath();
    c.moveTo(x-D*.025,top);c.lineTo(x+D*.025,top);
    c.lineTo(x-D*.24,bottom);c.lineTo(x-D*.6,bottom);c.closePath();c.fill();
  }
  for(let i=0;i<32;i++){
    const z=.2+rnd(i+811)*.8;
    const x=CX+(rnd(i+705)-.5)*D*2.5+Math.sin(t*.45+i)*D*.018*z;
    const y=CY+(rnd(i+913)-.5)*D*1.8-t*D*.018*z;
    c.globalAlpha=life*(.05+z*.14);c.fillStyle='#c3eeeb';
    c.beginPath();c.arc(x,y,(.45+z*.9)*Math.min(1,D/300),0,TAU);c.fill();
  }
  c.restore();
}
function submergedBadge(index,x,y,size,angle,alpha,depth) {
  badge(index,x,y,size,angle,alpha,1,1,`blur(${depth*3}px) saturate(${1-depth*.5}) brightness(${1-depth*.45})`);
  layer(tideArt[index],x,y,size,alpha*depth*.38,angle);
}
function island(t) {
  underwater(t);
  if(t<1.15){lift(0,t);return;}
  const farX=CX+D*.17,farY=CY-D*.13;
  if(t<3.05){
    const p=smooth(range(t,1.15,3.05)),swim=Math.sin(p*TAU)*Math.sin(p*Math.PI);
    submergedBadge(0,lerp(CX,farX,p)+swim*D*.025,lerp(CY,farY,p),
      D*lerp(1,.24,p),swim*.07,1-smooth(range(p,.08,1)),p);
  }else if(t>=3.35){
    const p=smooth(range(t,3.35,5.95)),depth=1-p,swim=Math.sin(p*TAU)*Math.sin(p*Math.PI);
    submergedBadge(1,lerp(farX,CX,p)-swim*D*.018,lerp(farY,CY,p),
      D*lerp(.24,1,p),-swim*.045,smooth(range(p,0,.82)),depth);
  }
}
function bloodDrop(x,y,r,length=1,alpha=1){if(r<.15||alpha<=0)return;c.save();c.globalAlpha*=sat(alpha);const g=c.createLinearGradient(x-r,y,x+r,y);g.addColorStop(0,'#260309');g.addColorStop(.4,'#8c1527');g.addColorStop(.65,'#b52c3c');g.addColorStop(1,'#3a0710');c.fillStyle=g;c.beginPath();c.moveTo(x,y-r*length*2);c.bezierCurveTo(x-r*.25,y-r*.5,x-r,y-r*.2,x-r,y+r*.3);c.bezierCurveTo(x-r,y+r*1.6,x+r,y+r*1.6,x+r,y+r*.3);c.bezierCurveTo(x+r,y-r*.2,x+r*.25,y-r*.5,x,y-r*length*2);c.fill();c.restore();}
function bloodPool(p,t,alpha=1){if(p<=0)return;const x=CX,y=CY+D*.48,w=D*.64*out(p),h=D*.075*out(p);c.save();c.globalAlpha*=sat(alpha);c.shadowColor='#170005aa';c.shadowBlur=14;const g=c.createLinearGradient(0,y-h,0,y+h);g.addColorStop(0,'#660d20');g.addColorStop(.35,'#9d2030');g.addColorStop(.6,'#420512');g.addColorStop(1,'#190308');c.fillStyle=g;c.beginPath();for(let i=0;i<=80;i++){const a=i/80*TAU,r=1+.04*Math.sin(a*5+t*.8),px=x+Math.cos(a)*w*r,py=y+Math.sin(a)*h*r;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();c.fill();c.shadowBlur=0;c.globalAlpha*=.45;c.strokeStyle='#d2586288';c.lineWidth=.8;c.beginPath();c.ellipse(x-w*.12,y-h*.15,w*.65,h*.5,-.015,Math.PI*1.08,Math.PI*1.85);c.stroke();c.restore();}
function bloodVeil(index,p,x=CX,y=CY,size=D,sy=1){layer(bloodArt[index],x,y,size,p);}
function bloodStreams(t,progress,fade=1){const bottom=CY+D*.48;for(let i=0;i<9;i++){const start=1.3+i*.08,q=range(t,start,start+1.3),x=CX+(i-4)*D*.068,y0=CY+D*(.12+Math.abs(i-4)*.035),y1=lerp(y0,bottom,out(q)),r=(1.5+rnd(i+71)*2.7)*progress; if(r<.1)continue;c.save();c.globalAlpha*=fade;c.lineCap='round';const g=c.createLinearGradient(x-r,0,x+r,0);g.addColorStop(0,'#380710');g.addColorStop(.55,'#9a2031');g.addColorStop(1,'#430811');c.strokeStyle=g;c.lineWidth=r*1.3;c.beginPath();c.moveTo(x,y0);c.bezierCurveTo(x+3,y0+20,x-2,y1-10,x,y1);c.stroke();c.restore();bloodDrop(x,y1,r,1.2,fade);}}
function horror(t){if(mode==='click'){lift(1,t);const p=Math.sin(range(t,.85,3.1)*Math.PI);bloodVeil(1,p*.38);for(let i=0;i<5;i++){const q=range(t,1.3+i*.1,2.7+i*.1),x=CX+(i-2)*D*.11;bloodDrop(x,CY+D*.3+q*q*70,(2+rnd(i)*2)*Math.sin(q*Math.PI),1.1,1-q);}return;}
if(t<1.15){lift(0,t);}
else if(t<2.5){const p=range(t,1.15,2.5);badge(0);bloodVeil(0,smooth(p)*.95);bloodStreams(t,smooth(p));bloodPool(range(t,1.9,2.5)*.5,t);}
else if(t<3.65){const p=inout(range(t,2.5,3.65));c.save();c.translate(CX,CY+p*D*.43);c.scale(1+p*.14,1-p*.96);layer(bloodArt[0],0,0,D,1-range(p,.75,1));c.restore();bloodStreams(t,1-p,1-p);bloodPool(.5+.5*p,t);for(let i=0;i<7;i++){const q=range(t,2.5+i*.06,3.6+i*.04);bloodDrop(CX+(i-3)*D*.07,CY+D*.15+q*q*D*.34,(3+rnd(i+77)*3)*Math.sin(q*Math.PI),1.6,1-q);}}
else{const p=out(range(t,3.65,5.65)),fade=1-smooth(range(t,5.25,6.3)),y=CY+D*.8*(1-p);bloodPool(1,t,fade);c.save();c.beginPath();c.rect(0,0,W,CY+D*.47);c.clip();badge(1,CX,y,D,0,p);bloodVeil(1,(1-p)*.9,CX,y,D);c.restore();for(let i=0;i<7;i++){const q=range(t,4.05+i*.09,5.7+i*.05),x=CX+(i-3)*D*.095;bloodDrop(x,y+D*.3+q*q*75,(2+rnd(i+94)*2.8)*Math.sin(q*Math.PI),1.5,1-q);}}}
function brackets(p,alpha=1){alpha*=1-smooth(range(frameTime,duration()-.55,duration()));c.save();c.globalAlpha=alpha;const r=D*.57+15*(1-p);for(const x of [-1,1])for(const y of [-1,1])stroke([[CX+x*r,CY+y*(r-15)],[CX+x*r,CY+y*r],[CX+x*(r-15),CY+y*r]],'#91e8dc',1);c.restore();}
function slats(index,p,extract){for(let i=0;i<20;i++){const q=out(sat(p*1.5-i*.024)),offset=extract?q*(W*.7): (1-q)*(i%2?W*.6:-W*.6),alpha=extract?1-q:1;c.save();c.beginPath();c.rect(CX-D/2+offset,CY-D/2+i*D/20,D,D/20+.4);c.clip();badge(index,CX+offset,CY,D,0,alpha);c.restore();}}
function scan(p,alpha=1){const y=CY-D*.6+D*1.2*p;c.save();c.globalAlpha=alpha;const g=c.createLinearGradient(0,y-22,0,y);g.addColorStop(0,'#83eddd00');g.addColorStop(1,'#83eddd33');c.fillStyle=g;c.fillRect(CX-D*.6,y-22,D*1.2,22);stroke([[CX-D*.6,y],[CX+D*.6,y]],'#b9fff0',1);c.restore();}
function lasers(t,p,fire=0){const origins=[[-20,H*.19],[W+20,H*.3],[W*.1,H+20],[W*.85,-20]];for(let i=0;i<4;i++){const o=origins[i],a=i*TAU/4+t*.28,acquire=smooth(sat((p-i*.065)/.8)),r=D*.65*(1-acquire),tx=CX+Math.cos(a)*r,ty=CY+Math.sin(a)*r;c.save();c.globalCompositeOperation='screen';c.globalAlpha=.18+.55*p;c.shadowColor='#f04438';c.shadowBlur=6;stroke([o,[tx,ty]],'#ff6655',.7);glow(tx,ty,6,'#ff5a3a',.7);if(fire>0){c.globalAlpha=fire;c.shadowColor='#ffb078';c.shadowBlur=22;stroke([o,[CX,CY]],'#ff763f',9);c.shadowBlur=6;stroke([o,[CX,CY]],'#fff3d5',3);}c.restore();}}
function war(t){if(mode==='click'){lift(1,t);brackets(out(t/1.5),range(t,.6,1.1)*.5);if(t>1.1&&t<2.6)scan(range(t,1.1,2.6),.5);return;}if(t<1.05){lift(0,t);}else if(t<2.9){badge(0);lasers(t,range(t,1.05,2.5));brackets(out(range(t,1.8,2.7)),.3);}else if(t<3.16){badge(0);const f=Math.sin(range(t,2.9,3.16)*Math.PI);lasers(t,1,f);glow(CX,CY,D*.9,'#ffe5b6',f*.6);}else if(t<5.3){const p=range(t,3.16,5.3);badge(1,CX,CY,D*(.92+.08*out(p)),0,out(p*3));shatter(art[0],p);for(let i=0;i<70;i++){const a=rnd(i+99)*TAU,r=out(p)*(30+rnd(i+19)*D*1.5),x=CX+Math.cos(a)*r,y=CY+Math.sin(a)*r+p*p*80;c.save();c.globalAlpha=(1-p)*(1-p);stroke([[x,y],[x-Math.cos(a)*(6+8*p),y-Math.sin(a)*(6+8*p)]],i%3?'#ffc183':'#f9f5d6',i%4?.8:1.5);c.restore();}mist(t,(1-p)*.65,'#b4a399');}else{badge(1);brackets(out(range(t,5.3,6)),.4);}}
function tiles(index,p,erase=false){const cells=28,s=D/cells;for(let y=0;y<cells;y++)for(let x=0;x<cells;x++){const threshold=erase?(y/cells*.65+rnd(x+33)*.2):(1-y/cells)*.65+rnd(x*19+y)*.2;const q=sat((p-threshold)/.15);if(erase&&q>=1||!erase&&q<=0)continue;const fall=erase?q*q*100:0,dx=CX-D/2+x*s,dy=CY-D/2+y*s+fall;c.save();c.globalAlpha=erase?1-q:q;c.drawImage(art[index],x/cells*art[index].width,y/cells*art[index].height,art[index].width/cells,art[index].height/cells,dx,dy,s+.25,s+.25);if(q<1){c.globalCompositeOperation='source-atop';c.fillStyle='#6bf1a344';c.fillRect(dx,dy,s,s);}c.restore();}}
function hacker(t){if(mode==='click'){if(t<1)lift(1,t);else if(t<2.3){badge(1);scan(range(t,1,2.3),Math.sin(range(t,1,2.3)*Math.PI)*.6);}else badge(1);return;}if(t<1.25)lift(0,t);else if(t<3.1)tiles(0,range(t,1.25,3.1),true);else if(t<5.4)tiles(1,range(t,3.1,5.4));else{badge(1);scan(range(t,5.4,6),1-range(t,5.8,6.2));}}
function clickPose(t,seconds=.95,arc=28){const a=origin(),p=out(t/seconds);return{x:lerp(a.x,CX,p),y:lerp(a.y,CY,p)-Math.sin(p*Math.PI)*arc,size:lerp(origin().size,D,p),p};}
function arcTrail(points,col,width,alpha){c.save();c.globalAlpha*=sat(alpha);c.lineCap='round';stroke(points,col,width);c.restore();}
function clickCosmic(t){const q=clickPose(t,1.25,52),energy=Math.sin(range(t,.05,1.65)*Math.PI),tilt=-.22*Math.sin(q.p*Math.PI);starfield(t*.45,energy*.7);const trail=[];for(let i=0;i<18;i++){const a=clickPose(Math.max(0,t-i*.012),1.25,52);trail.push([a.x,a.y+a.size*.33]);}arcTrail(trail,'#91d8ff',2,energy*.22);exhaust(q.x-Math.sin(tilt)*q.size*.32,q.y+Math.cos(tilt)*q.size*.32,20+energy*80,tilt,energy*.55);const drift=t>1.25?-5*Math.sin(range(t,1.25,2.4)*Math.PI):0;badge(1,q.x,q.y+drift,q.size,tilt,1,1-.1*Math.sin(q.p*Math.PI));if(t>1.1){const p=range(t,1.1,2.6);ring(CX,CY+D*.46,D*(.5+p*.25),Math.sin(p*Math.PI)*.25,'#8fcfff');}}
function clickWinter(t){if(t<.75){const q=clickPose(t,.75,20);badge(1,q.x,q.y,q.size,-.04*Math.sin(q.p*Math.PI));}else if(t<1.6){const p=range(t,.75,1.6);frost(1,p*.85);mist(t,p*.4);if(t>1.32)fractureLines(range(t,1.32,1.6)*.45);}else{const p=range(t,1.6,2.8);badge(1);c.save();c.globalAlpha=.82;shatter(ice,p);c.restore();mist(t,(1-p)*.65,'#d8f4ff',1+p*.3);}}
function clickJungle(t){const a=origin(),q=clickPose(t,1.1,50),grow=out(t/1.1),swing=Math.sin(t*5.5)*Math.exp(-t*1.7)*.15;c.save();c.globalAlpha=1-smooth(range(t,1.15,2.05));const pts=[];for(let i=0;i<=50*grow;i++){const p=i/50,x=lerp(a.x,CX,p),y=lerp(a.y,CY-D*.38,p)-Math.sin(p*Math.PI)*58;pts.push([x,y]);if(i%10===0&&i>0)leaf(x,y,6*out((grow-p)*8),-.6+p);}stroke(pts,'#789866',2);c.restore();vines(out(range(t,.85,2.1)),t);badge(1,q.x,q.y,q.size,swing);for(let i=0;i<6;i++){const p=range(t,1+i*.07,2.75+i*.03);leaf(CX+(i%2?1:-1)*(D*.4+p*18),CY-D*.25+p*D*.75,4,Math.sin(p*3+i)*.6,(1-p)*Math.sin(p*Math.PI));}}
function clickHazy(t) {
  const q=clickPose(t,1.65,42),haze=smooth(range(t,.05,.65))*(1-smooth(range(t,1.65,3.25)));
  const x=lerp(q.x,CX,.3),y=lerp(q.y,CY,.3),size=lerp(q.size,D,.45);
  smokeVeil(t,haze*1.1,false,x,y,size);
  badge(1,q.x,q.y,q.size,-.07*Math.sin(q.p*Math.PI),smooth(range(t,.05,.85)),1,1,
    `blur(${haze*2.3}px)`);
  smokeVeil(t+2,haze*1.05,true,x,y,size);
}
function clickSwarms(t){const q=clickPose(t,1.75,44),spread=Math.pow(Math.sin(range(t,.05,2.45)*Math.PI),2),alpha=smooth(range(t,.03,.32))*(1-smooth(range(t,1.85,2.45))),pts=pixels[1];badge(1,q.x,q.y,q.size,0,1-alpha);c.save();for(let i=0;i<pts.length;i++){const a=pts[i],phase=i*2.399+t*1.3,dx=Math.cos(phase)*spread*(12+rnd(i)*25),dy=Math.sin(phase)*spread*(7+rnd(i+11)*17),x=q.x+a.x*q.size+dx,y=q.y+a.y*q.size+dy,z=1.3+(1-spread)*2.7;c.globalAlpha=alpha*.94;c.fillStyle=`rgb(${a.r},${a.g},${a.b})`;c.beginPath();c.arc(x,y,z*.5,0,TAU);c.fill();if(i%4===0&&spread>.1){c.globalAlpha=alpha*spread*.15;stroke([[x,y],[x-Math.cos(phase)*7,y-Math.sin(phase)*7]],'#bfeaff',.6);}}c.restore();}
function clickLava(t){const q=clickPose(t,1.2,30),pulse=Math.sin(range(t,.05,2.3)*Math.PI),wobble=t<1.2?Math.sin(q.p*Math.PI)*.16:Math.sin((t-1.2)*9)*Math.exp(-(t-1.2)*3)*.09;wax(q.x,q.y+q.size*.1,q.size*.39,q.size*.42,pulse*.42);badge(1,q.x,q.y,q.size,-.04*Math.sin(q.p*Math.PI),1,1-wobble,1+wobble*1.2);for(let i=0;i<6;i++){const p=range(t,.8+i*.06,2.35+i*.06),x=CX+Math.sin(i*2.4)*D*.52*p,y=CY+D*.3-55*Math.sin(p*Math.PI)+p*p*45;wax(x,y,3*Math.sin(p*Math.PI),5*Math.sin(p*Math.PI),(1-p)*pulse);}glow(q.x,q.y+q.size*.35,q.size*.55,'#f28831',pulse*.045);}
function landingSplash(t,front=false) {
  const age=t-1.05;
  if(age<=0||age>=1.45)return;
  const p=range(age,0,.85),rise=Math.sin(Math.pow(p,.6)*Math.PI),fade=1-smooth(range(age,.4,1.1));
  const surface=CY+D*.41;
  c.save();
  // Narrow sheets of water bend outward from the impact, then collapse.
  for(let i=0;i<(front?4:7);i++){
    const side=i%2?-1:1,root=CX+side*D*(.12+rnd(i+32)*.2);
    const tip=root+side*D*(.14+rnd(i+55)*.22)*p;
    const height=D*(front?.055:.16+rnd(i+78)*.14)*rise;
    const width=D*(front?.07:.055)*(1-p*.6),y=surface+(front?D*.015:0);
    const water=c.createLinearGradient(0,y-height,0,y+2);
    water.addColorStop(0,'#d8fff8');water.addColorStop(.35,'#8cdbd5b8');water.addColorStop(1,'#277b9220');
    c.fillStyle=water;c.globalAlpha=fade*(front?.6:.72);c.beginPath();
    c.moveTo(root-width,y);
    c.bezierCurveTo(root-width,y-height*.35,tip-side*width,y-height,tip,y-height);
    c.bezierCurveTo(tip+side*width*.25,y-height*.85,root+width,y-height*.2,root+width,y);
    c.closePath();c.fill();
  }
  if(front)for(let i=0;i<22;i++){
    const a=Math.max(0,age-rnd(i+11)*.055),side=i%2?-1:1;
    const x=CX+side*D*(.16+rnd(i+20)*.17+a*(.2+rnd(i+31)*.45));
    const y=surface-D*(.35+rnd(i+53)*.45)*a+D*.82*a*a;
    const alpha=smooth(range(a,0,.045))*(1-smooth(range(a,.55,1.15)));
    if(alpha<=0)continue;
    c.globalAlpha=alpha*(.4+rnd(i+66)*.35);c.fillStyle='#cafaf1';
    c.beginPath();c.ellipse(x,y,D*(.0025+rnd(i+72)*.003),D*(.004+rnd(i+85)*.005),side*.4,0,TAU);c.fill();
  }
  c.restore();
}
function clickIsland(t) {
  const o=origin(),u=range(t,0,1.05),p=1-(1-u)*(1-u);
  const dip=t>1.05?Math.sin(range(t,1.05,1.65)*Math.PI)*D*.027:0;
  landingSplash(t);
  badge(1,lerp(o.x,CX,p),lerp(o.y,CY,p)-Math.sin(u*Math.PI)*D*.23+dip,
    lerp(o.size,D,p),-.055*Math.sin(u*Math.PI));
  landingSplash(t,true);
}
function clickHorror(t){const q=clickPose(t,1.02,16),wet=smooth(range(t,.45,1.05))*(1-smooth(range(t,1.25,2.55)));c.save();c.globalAlpha=.16*(1-range(t,.9,2));badge(1,q.x+8,q.y+14,q.size,0,1,1,1,'brightness(0) blur(8px)');c.restore();badge(1,q.x,q.y,q.size,-.025*Math.sin(q.p*Math.PI));c.save();const drain=range(t,1.15,2.4),edge=q.y-q.size*.55+q.size*1.15*smooth(drain);c.beginPath();c.rect(q.x-q.size*.6,edge,q.size*1.2,q.size*1.3);c.clip();bloodVeil(1,wet*.78,q.x,q.y,q.size);c.restore();if(t>1){for(let i=0;i<7;i++){const p=range(t,1.1+i*.055,2.5+i*.045),x=CX+(i-3)*D*.08,r=(2+rnd(i+41)*2.3)*Math.sin(p*Math.PI);bloodDrop(x,CY+D*.25+Math.pow(p,2)*D*.3,r,1.1,1-p);}bloodPool(.22,t,Math.sin(range(t,1.1,2.8)*Math.PI)*.5);}}
function clickWar(t){const q=clickPose(t,.8,15);badge(1,q.x,q.y,q.size,-.04*Math.sin(q.p*Math.PI));if(t>.55){const p=range(t,.55,1.8),fade=1-smooth(range(t,2.15,2.7));c.save();c.globalAlpha=fade;const points=[[-15,H*.2],[W+15,H*.26],[W*.22,H+15]];for(let i=0;i<3;i++){const a=i*TAU/3-.3,r=D*(.54*(1-smooth(range(p,i*.07,.8+i*.04)))+.12),x=CX+Math.cos(a)*r,y=CY+Math.sin(a)*r;c.save();c.globalCompositeOperation='screen';c.globalAlpha*=.2;stroke([points[i],[x,y]],'#ff6d72',.55);c.restore();glow(x,y,4,'#ff4b4b',.4);c.fillStyle='#ff6262';c.beginPath();c.arc(x,y,1.1,0,TAU);c.fill();}c.restore();brackets(out(range(t,.85,1.65)),.45*(1-smooth(range(t,2.55,3.2))));if(t>1.3)scan(range(t,1.3,2.4),Math.sin(range(t,1.3,2.4)*Math.PI)*.5);}}
function clickHacker(t){const q=clickPose(t,1.05,12),resolve=smooth(range(t,.15,1.85)),grid=22,sz=q.size/grid,blend=smooth(range(t,0,.18))*(1-smooth(range(t,1.45,2.25)));badge(1,q.x,q.y,q.size,0,1-blend);c.save();for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){const threshold=(y/grid)*.45+rnd(x*31+y+5)*.28,p=out((resolve-threshold)*4);if(p<=0)continue;const px=q.x-q.size/2+x*sz,py=q.y-q.size/2+y*sz-(1-p)*12;c.globalAlpha=blend*p;c.drawImage(art[1],x/grid*art[1].width,y/grid*art[1].height,art[1].width/grid,art[1].height/grid,px,py,sz+.2,sz+.2);if(p<.9){c.fillStyle='#70f5a2';c.globalAlpha=blend*(1-p)*.16;c.fillRect(px,py,sz,sz);}}c.restore();if(t>1.35)scan(range(t,1.35,2.35),Math.sin(range(t,1.35,2.35)*Math.PI)*.55);}
const clickRenderers={cosmic:clickCosmic,winter:clickWinter,jungle:clickJungle,hazy:clickHazy,swarms:clickSwarms,lavalamp:clickLava,island:clickIsland,horror:clickHorror,war:clickWar,hacker:clickHacker};

const renderers={cosmic,winter,jungle,hazy,swarms,lavalamp:lava,island,horror,war,hacker};

function prepare(oldArt,newArt) {
  art=[oldArt,newArt]; mask=[]; frozen=[]; pixels=[]; bloodArt=[]; tideArt=[];
  glintCanvas=glintCanvas||off(256);
  if(theme==='hazy'&&!smokeClouds.length)smokeClouds=[makeSmokeCloud(0),makeSmokeCloud(1),makeSmokeCloud(2)];
  if(theme==='lavalamp'&&!lavaSurface){lavaSurface=off(224);lavaPixels=lavaSurface.getContext('2d').createImageData(224,224);}
  if(theme==='cosmic'&&!planets.length) planets=[makePlanet(0),makePlanet(1)];
  if(theme==='winter') {
    frostCanvas=frostCanvas||off(); shardCells=shardCells.length?shardCells:makeShards();
    if(!fractures.length) for(let i=0;i<15;i++) {
      let a=rnd(i)*TAU,r=0,pts=[[0,0]];
      for(let j=0;j<9;j++){r+=18+rnd(i*10+j)*12;a+=(rnd(i*23+j)-.5)*.45;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}
      fractures.push(pts);
    }
    for(const im of art){
      const q=off(),g=q.getContext('2d');g.drawImage(im,0,0,512,512);
      g.globalCompositeOperation='source-atop';g.fillStyle='#d4f5ff';g.fillRect(0,0,512,512);mask.push(q);
      const f=off(),fc=f.getContext('2d');fc.drawImage(im,85,85,342,342);fc.drawImage(ice,0,0,512,512);frozen.push(f);
    }
  }
  if(theme==='island') tideArt=art.map(im=>{
    const q=off(),g=q.getContext('2d');g.drawImage(im,0,0,512,512);
    g.globalCompositeOperation='source-in';g.fillStyle='#398d9c';g.fillRect(0,0,512,512);return q;
  });
  if(theme==='war'&&!shardCells.length) shardCells=makeShards();
  if(theme==='horror') bloodArt=art.map(im=>{
    const q=off(),g=q.getContext('2d');g.drawImage(im,0,0,512,512);g.globalCompositeOperation='source-atop';
    const grad=g.createLinearGradient(0,0,512,512);grad.addColorStop(0,'#360612f0');grad.addColorStop(.45,'#a5283ee6');grad.addColorStop(.7,'#580916f0');grad.addColorStop(1,'#24030bf0');g.fillStyle=grad;g.fillRect(0,0,512,512);return q;
  });
  if(theme==='swarms') pixels=art.map(im=>{
    const q=off(256),g=q.getContext('2d');g.drawImage(im,0,0,256,256);
    const data=g.getImageData(0,0,256,256).data,ps=[];
    for(let y=0;y<256;y+=5)for(let x=0;x<256;x+=5){const i=(y*256+x)*4;if(data[i+3]>100)ps.push({x:x/256-.5,y:y/256-.5,r:data[i],g:data[i+1],b:data[i+2]});}
    return ps;
  });
}
return {
  prepare,
  get iceSource(){return theme==='winter'?ICE_SHELL:null;},
  setIce(value){ice=value;},
  geometry(width,height,hero){W=width;H=height;D=hero.size;CX=hero.x+D/2;CY=hero.y+D/2;},
  start(from,promotion){sourceBox=from;mode=promotion?'promotion':'click';},
  duration,
  draw(t){
    frameTime=t;
    c.clearRect(0,0,W,H);
    c.save();c.globalAlpha=out(t/.35)*(1-smooth(range(t,duration()-.8,duration())));bg(t);c.restore();
    atmosphere(t);(mode==='click'?clickRenderers:renderers)[theme](t);finishingLight(t);
  },
  still(box){c.clearRect(0,0,W,H);if(art[1])badge(1,box?box.x+box.size/2:CX,box?box.y+box.size/2:CY,box?box.size:D);},
  clear(){c.clearRect(0,0,W,H);},
  dispose(){art=[];mask=[];frozen=[];pixels=[];bloodArt=[];tideArt=[];planets=[];ice=null;glintCanvas=null;frostCanvas=null;lavaSurface=null;lavaPixels=null;smokeClouds=[];},
};
}
