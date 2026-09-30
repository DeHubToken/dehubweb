import * as THREE from 'three';
import { traceMetalOutline } from './metal-outline';

/** The same renderer runs in the web showcase and the bundled mobile WebView. */
export class MetalStage {
  constructor(canvas, options) {
    const state = { index: 0, metal: true, finish: 'Chrome', thickness: .18 };
    const items = [], textures = [], outlines = [], loads = new Map();
    let renderer, scene, camera, group, oldMesh=null, shards=null, env, width=1, height=1;
    let held=false, disposed=false, serial=0, raf=0, flowActive=false, flowKind='', flowStart=0, flowSource, flowTarget, done=null;
    let oldIndex=-1, rotX=.04, rotY=-.3, targetX=.04, targetY=-.3, spinStart=0, spinDuration=0, drag=null;
    const reduce = () => !!options.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp=t=>Math.max(0,Math.min(1,t)),ease=t=>1-Math.pow(1-t,3),lerp=(a,b,t)=>a+(b-a)*t;
    const phase=()=>{};
    const fx=document.createElement('canvas');
    fx.setAttribute('aria-hidden','true');
    Object.assign(fx.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
    const fc=fx.getContext('2d');
    if(!fc) throw new Error('Badge effects canvas unavailable');
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(33,1,.1,100);camera.position.z=5.6;
    const studio=new THREE.Scene();studio.background=new THREE.Color('#303339');
    const panel=(w,h,x,y,z,rx,ry,intensity)=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(intensity,intensity,intensity),side:THREE.DoubleSide}));p.position.set(x,y,z);p.rotation.set(rx,ry,0);studio.add(p);};
    panel(3,8,-4,2,3,0,.65,5);panel(2,9,4,1,0,0,-1.1,3);panel(7,2,0,5,1,1.2,0,4);panel(1,7,.5,1,-4,0,0,2);panel(6,2,0,-4,2,1.2,0,.8);
    const pm=new THREE.PMREMGenerator(renderer);env=pm.fromScene(studio,.03);pm.dispose();
    studio.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});scene.environment=env.texture;
    scene.add(new THREE.AmbientLight(0xffffff,.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,5,5);scene.add(light);
    canvas.parentElement.append(fx);
    const local=box=>{const r=canvas.getBoundingClientRect();return {x:box.x-r.left,y:box.y-r.top,size:box.size};};
    const hero=()=>local(options.hero());
    function clearFx(){fc.clearRect(0,0,width,height);}
    function blend(a,b,t,arc=35){return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)-Math.sin(t*Math.PI)*arc,size:lerp(a.size,b.size,t)};}
    function wake(){if(!disposed&&!raf&&!document.hidden)raf=requestAnimationFrame(frame);}
    function resize(){width=Math.max(1,canvas.clientWidth);height=Math.max(1,canvas.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();const dpr=renderer.getPixelRatio();fx.width=Math.round(width*dpr);fx.height=Math.round(height*dpr);fc.setTransform(dpr,0,0,dpr,0,0);wake();}
    const observer=new ResizeObserver(resize);observer.observe(canvas);if(options.interactionElement)observer.observe(options.interactionElement);resize();
    async function prepare(index){
      if(textures[index])return true;
      if(loads.has(index))return loads.get(index);
      const item=items[index];if(!item)return false;
      const pending=(async()=>{
        const image=new Image();image.crossOrigin='anonymous';
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{image.src='';reject(new Error('Badge artwork timed out'));},8000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('Badge artwork unavailable'));};image.src=item.src;});
        if(disposed)return false;
        const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,256,256);
        const small=document.createElement('canvas');small.width=small.height=96;const sc=small.getContext('2d');sc.drawImage(image,0,0,96,96);outlines[index]=traceMetalOutline(sc.getImageData(0,0,96,96).data,96);
        const pixels=ctx.getImageData(0,0,256,256);for(let i=0;i<pixels.data.length;i+=4){const l=pixels.data[i]*.3+pixels.data[i+1]*.59+pixels.data[i+2]*.11;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=l;}ctx.putImageData(pixels,0,0);
        const gray=new THREE.CanvasTexture(c);gray.colorSpace=THREE.SRGBColorSpace;
        const color=new THREE.Texture(image);color.colorSpace=THREE.SRGBColorSpace;color.needsUpdate=true;textures[index]={gray,color};
        const cached=textures.map((t,i)=>t?i:-1).filter(i=>i>=0);
        while(cached.length>5){const victim=cached.find(i=>i!==index&&i!==state.index&&i!==oldIndex);if(victim===undefined)break;textures[victim].gray.dispose();textures[victim].color.dispose();delete textures[victim];delete outlines[victim];cached.splice(cached.indexOf(victim),1);}
        return true;
      })().catch(()=>false).finally(()=>loads.delete(index));loads.set(index,pending);return pending;
    }
function makeBadge(index){const result=new THREE.Group();
const b=items[index],tex=textures[index],shape=new THREE.Shape(),smooth=outlines[index].map((p,i,a)=>{let x=0,y=0;for(let k=-3;k<=3;k++){const q=a[(i+k+a.length)%a.length];x+=q[0];y+=q[1];}return [x/7,y/7];}),points=smooth.filter((_,i)=>i%2===0).map(p=>new THREE.Vector2((p[0]/96-.5)*2.4,(.5-p[1]/96)*2.4));shape.setFromPoints(points);
const gold=state.finish==='Gold',enamel=state.finish==='Original enamel';const color=gold?0xd8b96f:0xc8d0d6;
if(state.metal){const geo=new THREE.ExtrudeGeometry(shape,{depth:state.thickness,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.035,bevelThickness:.06,curveSegments:8});geo.translate(0,0,-state.thickness/2);const metal=new THREE.MeshStandardMaterial({color,metalness:1,roughness:.18,envMapIntensity:1.4});result.add(new THREE.Mesh(geo,metal));
const face=new THREE.ShapeGeometry(shape);const pos=face.attributes.position,uv=face.attributes.uv;for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)/2.4+.5,pos.getY(i)/2.4+.5);const mat=new THREE.MeshPhysicalMaterial({map:enamel?tex.color:tex.gray,color:gold?0xffdda0:0xffffff,metalness:enamel?.62:.86,roughness:.25,clearcoat:1,clearcoatRoughness:.15,bumpMap:tex.gray,bumpScale:.035,envMapIntensity:.8,side:THREE.FrontSide});const front=new THREE.Mesh(face,mat);front.position.z=state.thickness/2+.061;result.add(front);
const backCanvas=document.createElement('canvas');backCanvas.width=backCanvas.height=256;const bc=backCanvas.getContext('2d');bc.fillStyle=gold?'#baa270':'#929ca4';bc.fillRect(0,0,256,256);bc.fillStyle='#565d64';bc.textAlign='center';bc.font='bold 26px Arial';bc.fillText('DeHub',128,126);bc.font='12px Arial';bc.fillText(b.label || '',128,147);const backTex=new THREE.CanvasTexture(backCanvas);backTex.colorSpace=THREE.SRGBColorSpace;const backGeo=face.clone();const backMat=new THREE.MeshStandardMaterial({map:backTex,metalness:.85,roughness:.25,side:THREE.BackSide});const back=new THREE.Mesh(backGeo,backMat);back.position.z=-state.thickness/2-.061;result.add(back);
}else{const edge=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}));edge.scale.setScalar(1.035);result.add(edge);const front=new THREE.Mesh(new THREE.PlaneGeometry(2.4,2.4),new THREE.MeshBasicMaterial({map:tex.color,transparent:true,side:THREE.DoubleSide}));front.position.z=.01;result.add(front);}
return result;}
function disposeBadge(item){if(!item)return;scene.remove(item);item.traverse(child=>{child.geometry?.dispose();if(child.material){const materials=Array.isArray(child.material)?child.material:[child.material];materials.forEach(m=>{if(m.map&&!textures.some(t=>t.gray===m.map||t.color===m.map))m.map.dispose();m.dispose();});}});}
function pose(mesh,box,ry=-.3,rx=.04,rz=0){const worldPerPixel=2*camera.position.z*Math.tan(camera.fov*Math.PI/360)/height;mesh.position.set((box.x+box.size/2-width/2)*worldPerPixel,(height/2-box.y-box.size/2)*worldPerPixel,0);mesh.scale.setScalar(Math.max(.0001,box.size*worldPerPixel/2.4));mesh.rotation.set(rx,ry,rz);}
function drawMesh(mesh,box,ry=-.3,rx=.04,rz=0){group.visible=mesh===group;if(oldMesh)oldMesh.visible=mesh===oldMesh;if(mesh){mesh.visible=true;pose(mesh,box,ry,rx,rz);}renderer.render(scene,camera);}

const crackProgress={value:0},crackWidth={value:0};
function fractureMaterial(material,seed){
  material.onBeforeCompile=shader=>{
    shader.uniforms.uCrackProgress=crackProgress;shader.uniforms.uCrackWidth=crackWidth;shader.uniforms.uShardSeed={value:seed.clone()};
    shader.vertexShader='uniform float uCrackProgress;\nuniform float uCrackWidth;\nuniform vec2 uShardSeed;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec2 originalXY=position.xy+uShardSeed;
      float radius=length(originalXY);
      float travelled=1.0-smoothstep(-0.09,0.16,radius-(uCrackProgress*1.85-0.12));
      vec2 splitDirection=normalize(uShardSeed+vec2(0.016,0.009));
      transformed.xy+=splitDirection*uCrackWidth*travelled;
      transformed.z+=uCrackWidth*travelled*(0.6+0.35*sin(uShardSeed.x*12.0+uShardSeed.y*8.0));
    `);
  };
  material.customProgramCacheKey=()=> 'badge-fracture-wave-v1';
  return material;
}
function buildShards(source){
  const root=new THREE.Group(),face=source.children[1],geometry=face.geometry,positions=geometry.attributes.position,indices=geometry.index;
  const seeds=[];for(let y=0;y<5;y++)for(let x=0;x<5;x++){const n=y*5+x;seeds.push(new THREE.Vector2(-1.12+x*.56+Math.sin(n*12.8)*.16,-1.12+y*.56+Math.cos(n*7.1)*.16));}
  const clip=(poly,nx,ny,c)=>{const out=[];for(let k=0;k<poly.length;k++){const a=poly[k],b=poly[(k+1)%poly.length],da=a.x*nx+a.y*ny-c,db=b.x*nx+b.y*ny-c;if(da<=.000001)out.push(a);if((da<0)!==(db<0)){const t=da/(da-db);out.push(new THREE.Vector2(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t));}}return out;};
  seeds.forEach((seed,id)=>{
    const vertices=[],uvs=[],normals=[],faceRanges=[];let frontCount=0;const pieces=[];
    for(let i=0;i<indices.count;i+=3){let poly=[0,1,2].map(k=>{const ix=indices.getX(i+k);return new THREE.Vector2(positions.getX(ix),positions.getY(ix));});for(let j=0;j<seeds.length&&poly.length>2;j++){if(j===id)continue;const q=seeds[j];poly=clip(poly,q.x-seed.x,q.y-seed.y,(q.x*q.x+q.y*q.y-seed.x*seed.x-seed.y*seed.y)/2);}if(poly.length>2)pieces.push(poly);}
    if(!pieces.length)return;
    const z=state.thickness/2+.061;
    const vertex=(p,z,nx,ny,nz)=>{vertices.push(p.x-seed.x,p.y-seed.y,z);uvs.push(p.x/2.4+.5,p.y/2.4+.5);normals.push(nx,ny,nz);};
    for(const poly of pieces)for(let k=1;k<poly.length-1;k++){vertex(poly[0],z,0,0,1);vertex(poly[k],z,0,0,1);vertex(poly[k+1],z,0,0,1);}
    frontCount=vertices.length/3;
    for(const poly of pieces){for(let k=1;k<poly.length-1;k++){vertex(poly[0],-z,0,0,-1);vertex(poly[k+1],-z,0,0,-1);vertex(poly[k],-z,0,0,-1);}for(let k=0;k<poly.length;k++){const a=poly[k],b=poly[(k+1)%poly.length],len=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=(b.y-a.y)/len,ny=-(b.x-a.x)/len;vertex(a,z,nx,ny,0);vertex(a,-z,nx,ny,0);vertex(b,z,nx,ny,0);vertex(b,z,nx,ny,0);vertex(a,-z,nx,ny,0);vertex(b,-z,nx,ny,0);}}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.addGroup(0,frontCount,0);geo.addGroup(frontCount,vertices.length/3-frontCount,1);
    const front=fractureMaterial(face.material.clone(),seed),edge=fractureMaterial(new THREE.MeshStandardMaterial({color:state.finish==='Gold'?0xdcb96c:0x929da9,metalness:1,roughness:.3}),seed);front.side=THREE.DoubleSide;const mesh=new THREE.Mesh(geo,[front,edge]);mesh.position.set(seed.x,seed.y,0);
    const a=Math.atan2(seed.y+.01,seed.x+.01)+Math.sin(id*3.7)*.25,speed=.85+(id*17%11)*.12;
    mesh.userData={seed:seed.clone(),velocity:new THREE.Vector3(Math.cos(a)*speed,Math.sin(a)*speed,11.8+(id*7%9)*.85),spin:new THREE.Vector3(Math.sin(id*3.1)*5,Math.cos(id*5.4)*6,Math.sin(id*2.8)*3),release:Math.max(0,seed.length()-.25)*.025};root.add(mesh);
  });
  crackProgress.value=0;crackWidth.value=0;root.visible=true;scene.add(root);renderer.compile(scene,camera);root.visible=false;return root;
}
function smashFX(t,charge=false){const cx=flowTarget.x+flowTarget.size/2,cy=flowTarget.y+flowTarget.size/2;
  if(charge)return;
  const flash=Math.max(0,1-t/.13);if(flash){const g=fc.createRadialGradient(cx,cy,0,cx,cy,240);g.addColorStop(0,`rgba(240,248,255,${flash*.78})`);g.addColorStop(.25,`rgba(159,213,255,${flash*.32})`);g.addColorStop(1,'rgba(180,220,255,0)');fc.fillStyle=g;fc.fillRect(cx-240,cy-240,480,480);}
  const q=clamp(t/.75);fc.strokeStyle=`rgba(198,227,255,${(1-q)*.65})`;fc.lineWidth=2*(1-q)+.3;fc.beginPath();fc.ellipse(cx,cy,35+q*280,16+q*135,-.18,0,Math.PI*2);fc.stroke();
  for(let i=0;i<22;i++){const a=i*2.39996,r=45+t*(150+i%7*19),tail=10*(1-t),alpha=Math.max(0,1-t*1.2);fc.strokeStyle=`rgba(221,238,255,${alpha*.7})`;fc.lineWidth=i%3===0?1.5:.6;fc.beginPath();fc.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r*.7+t*t*45);fc.lineTo(cx+Math.cos(a)*(r-tail),cy+Math.sin(a)*(r-tail)*.7+t*t*45);fc.stroke();}
}
function promotionFrame(ms){
  const first=!oldMesh,hero={...flowTarget,size:flowTarget.size*1.18,x:flowTarget.x-flowTarget.size*.09,y:flowTarget.y-flowTarget.size*.09};
  if(ms<1150){phase(first?'Your first badge':'Moving up');const t=clamp(ms/1150);drawMesh(first?null:oldMesh,blend(flowSource,hero,ease(clamp(ms/950)),45),-.12-Math.PI*2*(1-ease(t)),.035+.15*Math.sin(t*Math.PI));}
  else if(ms<1970){phase('');const t=(ms-1150)/820,shake=Math.pow(t,3)*2;const charged={...hero,x:hero.x+Math.sin(ms*.1)*shake,y:hero.y+Math.cos(ms*.09)*shake*.4};
    if(oldMesh)oldMesh.visible=false;group.visible=false;
    if(shards){shards.visible=true;pose(shards,charged,-.12,.035,Math.sin(ms*.12)*t*.012);crackProgress.value=t;crackWidth.value=.018+.04*t;
      for(const piece of shards.children){const d=piece.userData,arrived=clamp((t*1.85-d.seed.length())/.45);piece.position.set(d.seed.x,d.seed.y,0);piece.rotation.set(arrived*Math.sin(d.seed.y*9)*.025,arrived*Math.cos(d.seed.x*7)*.025,0);}}
    renderer.render(scene,camera);
  }
  else if(ms<4200){phase('Badge unlocked');const t=(ms-1970)/2230,progress=t<.18?t*.9:.162+Math.pow((t-.18)/.82,1.15)*1.15;
    if(oldMesh)oldMesh.visible=false;group.visible=true;
    const reveal=ease(clamp(t/.68)),size=flowTarget.size*(.88+.12*reveal),shake=Math.max(0,1-t/.16)*5;
    pose(group,{x:flowTarget.x+(flowTarget.size-size)/2+Math.sin(ms*.13)*shake,y:flowTarget.y+(flowTarget.size-size)/2,size},-.3+.9*(1-reveal),.04+.09*(1-reveal));group.position.z=-.08*(1-reveal);
    if(shards){shards.visible=true;pose(shards,hero,-.12,.035);crackProgress.value=1;crackWidth.value=.058;for(const piece of shards.children){const d=piece.userData,v=d.velocity,travel=Math.max(0,progress-d.release),initial=clamp(travel/.12);piece.position.set(d.seed.x+v.x*travel,d.seed.y+v.y*travel-.28*travel*travel,v.z*travel*.55/Math.max(.001,shards.scale.x));piece.rotation.set(d.spin.x*travel+(1-initial)*Math.sin(d.seed.y*9)*.025,d.spin.y*travel+(1-initial)*Math.cos(d.seed.x*7)*.025,d.spin.z*travel);piece.scale.setScalar(1);}}
    renderer.toneMappingExposure=1.25+Math.max(0,1-t/.18)*.55;renderer.render(scene,camera);smashFX(t);
    
  }else{settle();return false;}
  return true;
}


    function cancel(){flowActive=false;done=null;clearFx();disposeBadge(oldMesh);disposeBadge(shards);oldMesh=shards=null;oldIndex=-1;renderer.toneMappingExposure=1.25;if(group)group.visible=true;}
    function settle(){const callback=done;cancel();spinDuration=0;targetY=rotY=-.3;targetX=rotX=.04;if(group)drawMesh(group,hero());callback?.();}
    function frame(now){raf=0;if(disposed||!group||held)return;clearFx();
      if(flowActive){
        const ms=now-flowStart;flowTarget=hero();
        if(flowKind==='promotion'){if(!promotionFrame(ms))return;}
        else if(flowKind==='close'){const t=clamp(ms/580);drawMesh(group,blend(flowTarget,flowSource,ease(t),-20),-.3+t*.3,.04*(1-t));if(t===1){const callback=done;cancel();group.visible=false;renderer.render(scene,camera);callback?.();return;}}
        else{const t=clamp(ms/1400);drawMesh(group,blend(flowSource,flowTarget,ease(clamp(ms/1050))),-.3-Math.PI*2*(1-ease(t)),.04+.2*Math.sin(t*Math.PI),-.1*Math.sin(t*Math.PI));if(t===1){settle();return;}}
        wake();return;
      }
      const active=spinDuration&&now-spinStart<spinDuration,t=active?(now-spinStart)/spinDuration:1;
      rotX+=(targetX-rotX)*.13;rotY+=(targetY-rotY)*.13;
      drawMesh(group,hero(),rotY+(active?(1-ease(t))*Math.PI*2:0),rotX);
      if(active||Math.abs(targetX-rotX)+Math.abs(targetY-rotY)>.001)wake();
    }
    this.setItems=values=>{items.splice(0,items.length,...values);};
    this.preload=index=>{void prepare(index);};
    this.show=async(index,config={})=>{const id=++serial;cancel();held=!!config.hold;state.index=index;if(!await prepare(index)||disposed||id!==serial)return false;disposeBadge(group);group=makeBadge(index);scene.add(group);targetX=rotX=.04;targetY=rotY=-.3;spinStart=performance.now();spinDuration=config.hold||config.instant||reduce()?0:900;if(config.hold){group.visible=false;renderer.clear();}else{drawMesh(group,hero());if(spinDuration)wake();}return true;};
    this.reveal=()=>{};
    this.layout=()=>wake();
    this.open=async({from,fromArt,promote,onLanded})=>{
      const id=++serial;cancel();spinDuration=0;
      if(promote&&fromArt&&!reduce()){oldIndex=items.findIndex(i=>i.src===fromArt);if(oldIndex<0){oldIndex=items.length;items.push({src:fromArt});}
        if(await prepare(oldIndex)&&!disposed&&id===serial){oldMesh=makeBadge(oldIndex);scene.add(oldMesh);shards=buildShards(oldMesh);}}
      if(disposed||id!==serial)return;
      held=false;done=onLanded;flowTarget=hero();flowSource=from?local(from):{...flowTarget,size:flowTarget.size*.15,x:flowTarget.x+flowTarget.size*.425,y:flowTarget.y+flowTarget.size*.425};flowKind=promote?'promotion':'details';flowActive=true;flowStart=performance.now()-(promote&&!oldMesh?1970:0);
      if(reduce()){settle();return;}
      drawMesh(promote?oldMesh:group,flowSource,-.3);wake();
    };
    this.skip=()=>{if(flowActive)settle();};
    this.close=(home,onClosed)=>{++serial;cancel();held=false;if(!group||reduce()){onClosed();return;}spinDuration=0;flowSource=local(home);flowTarget=hero();flowKind='close';done=onClosed;flowActive=true;flowStart=performance.now();wake();};
    const interaction=options.interactionElement||canvas;
    const down=e=>{if(flowActive){this.skip();return;}if(!group)return;const r=interaction.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,angle:targetY,moved:false};interaction.setPointerCapture?.(e.pointerId);spinDuration=0;options.onInteract?.();};
    const move=e=>{if(reduce()||flowActive||!group)return;if(drag){drag.moved ||= Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>5;targetY=drag.angle+(e.clientX-drag.x)*.012;targetX=Math.max(-.45,Math.min(.45,(e.clientY-drag.y)*.005));}else if(e.pointerType==='mouse'){const r=interaction.getBoundingClientRect();targetY=(e.clientX-r.left-r.width/2)/r.width*.8;targetX=(e.clientY-r.top-r.height/2)/r.height*.3;}wake();};
    const up=e=>{if(drag&&!drag.moved){const r=canvas.getBoundingClientRect(),b=hero(),x=e.clientX-r.left,y=e.clientY-r.top;const hit=x>=b.x&&x<=b.x+b.size&&y>=b.y&&y<=b.y+b.size;if(hit)options.onTap?.();else options.onMiss?.();}drag=null;};
    const reset=()=>{drag=null;targetY=-.3;targetX=.04;wake();};
    interaction.addEventListener('pointerdown',down);interaction.addEventListener('pointermove',move);interaction.addEventListener('pointerup',up);interaction.addEventListener('pointercancel',reset);interaction.addEventListener('pointerleave',reset);
    const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;if(flowActive)settle();}else wake();};
    const lost=e=>{e.preventDefault();cancelAnimationFrame(raf);raf=0;options.onError?.();};
    document.addEventListener('visibilitychange',visibility);canvas.addEventListener('webglcontextlost',lost);
    this.dispose=()=>{disposed=true;++serial;cancelAnimationFrame(raf);cancel();disposeBadge(group);textures.forEach(t=>{t?.gray.dispose();t?.color.dispose();});env.dispose();renderer.dispose();observer.disconnect();fx.remove();document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',lost);interaction.removeEventListener('pointerdown',down);interaction.removeEventListener('pointermove',move);interaction.removeEventListener('pointerup',up);interaction.removeEventListener('pointercancel',reset);interaction.removeEventListener('pointerleave',reset);};
  }
}
