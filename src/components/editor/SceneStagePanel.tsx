import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { newSceneStage, renderSceneStage, STAGE_COLORS, type SceneStage, type StageObject, type StageLight } from '@/lib/editor/sceneStage';

function renderFrame(scene: SceneStage, width: number, height: number, signal: AbortSignal): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(new Blob([`onmessage=e=>{try{const result=(${renderSceneStage.toString()})(e.data.scene,e.data.width,e.data.height);postMessage(result,[result.pixels.buffer]);}catch(error){postMessage({error:String(error)});}}`], { type: 'text/javascript' }));
    const worker = new Worker(source);
    const timeout=setTimeout(()=>{stop();reject(new Error('Stage renderer timed out'));},20000);
    const stop = () => { clearTimeout(timeout);worker.terminate(); URL.revokeObjectURL(source); signal.removeEventListener('abort', cancel); };
    const cancel = () => { stop(); reject(new DOMException('Cancelled','AbortError')); };
    signal.addEventListener('abort', cancel, { once: true });
    worker.onerror = () => { stop(); reject(new Error('Stage renderer failed')); };
    worker.onmessage = event => { stop(); if(event.data.error) reject(new Error(event.data.error)); else resolve(new ImageData(event.data.pixels,event.data.width,event.data.height)); };
    if(signal.aborted) cancel(); else worker.postMessage({scene,width,height});
  });
}
export function SceneStagePanel({ value, onChange, onFrame }: { value?: SceneStage; onChange(scene: SceneStage): void; onFrame(url: string, signal: AbortSignal): Promise<void> }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null), live = useRef(new AbortController());
  const [selected, setSelected] = useState(0), [light, setLight] = useState(0), [busy, setBusy] = useState(false), [error,setError]=useState(false);
  useEffect(() => {live.current=new AbortController();return () => live.current.abort();}, []);
  useEffect(() => {
    if(!value) return;
    const abort=new AbortController(); setError(false);
    const timeout=setTimeout(() => { void renderFrame(value,160,90,abort.signal).then(image => { if(!abort.signal.aborted) canvas.current?.getContext('2d')?.putImageData(image,0,0); }).catch(() => { if(!abort.signal.aborted) setError(true); }); },120);
    return () => { clearTimeout(timeout); abort.abort(); };
  },[value]);
  const text=(key:string)=>t(`editor.stage.${key}`);
  const button='min-h-11 rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-40';
  if(!value) return <button type="button" className={`${button} mt-3`} onClick={()=>onChange(newSceneStage())}>{text('create')}</button>;
  const object=value.objects[Math.min(selected,value.objects.length-1)];
  const changeObject=(patch:Partial<StageObject>)=>onChange({...value,objects:value.objects.map((o,i)=>o===object?{...o,...patch}:o)});
  const changeLight=(patch:Partial<StageLight>)=>onChange({...value,lights:value.lights.map((l,i)=>i===light?{...l,...patch}:l)});
  const number=(key:string,n:number,min:number,max:number,step:number,change:(v:number)=>void)=><label key={key} className="block text-xs">{text(key)}<input type="range" className="my-2 w-full" min={min} max={max} step={step} value={n} onChange={e=>change(Number(e.target.value))}/><output>{n.toFixed(step<1?1:0)}</output></label>;
  const colors=(current:string,change:(color:string)=>void)=><div className="my-2 flex flex-wrap gap-1">{STAGE_COLORS.map(color=><button type="button" key={color} aria-label={`${text('color')} ${color}`} aria-pressed={current===color} className="h-11 w-11 rounded-lg border-2" style={{backgroundColor:color,borderColor:current===color?'currentColor':'transparent'}} onClick={()=>change(color)}/>)}</div>;
  const capture=async()=>{
    if(busy)return; setBusy(true);setError(false);
    try{const image=await renderFrame(value,320,180,live.current.signal);if(live.current.signal.aborted)return;
      const output=document.createElement('canvas');output.width=image.width;output.height=image.height;output.getContext('2d')!.putImageData(image,0,0);await onFrame(output.toDataURL('image/png'),live.current.signal);
    }catch{if(!live.current.signal.aborted)setError(true);}finally{if(!live.current.signal.aborted)setBusy(false);}
  };
  return <details className="mt-3 rounded-xl border border-white/15 p-3"><summary>{text('title')}</summary>
    <p className="my-2 text-xs opacity-70">{text('hint')}</p>
    <canvas ref={canvas} width={160} height={90} aria-label={text('preview')} className="w-full rounded-lg"/>
    {error&&<p role="alert">{text('error')}</p>}
    <fieldset disabled={busy} className="mt-3 space-y-3"><legend>{text('camera')}</legend>
      {number('yaw',value.camera.yaw,-180,180,5,yaw=>onChange({...value,camera:{...value.camera,yaw}}))}
      {number('elevation',value.camera.elevation,5,75,1,elevation=>onChange({...value,camera:{...value.camera,elevation}}))}
      {number('distance',value.camera.distance,3,16,0.5,distance=>onChange({...value,camera:{...value.camera,distance}}))}
      {number('fov',value.camera.fov,25,80,1,fov=>onChange({...value,camera:{...value.camera,fov}}))}
      <div className="flex flex-wrap gap-2">{value.objects.map((o,i)=><button type="button" key={i} className={button} aria-pressed={o===object} onClick={()=>setSelected(i)}>{text('object')} {i+1}</button>)}
        {(['sphere','box'] as const).map(kind=><button type="button" key={kind} className={button} disabled={value.objects.length>=4} onClick={()=>{setSelected(value.objects.length);onChange({...value,objects:[...value.objects,{kind,x:0,y:0.75,z:0,scale:1.5,yaw:0,color:'#70a66c'}]});}}>{text('add')} {text(kind)}</button>)}
      </div>
      {object&&<fieldset><legend>{text(object.kind)}</legend>{(['x','y','z'] as const).map(axis=>number(axis,object[axis],axis==='y'?0.25:-6,6,0.25,n=>changeObject({[axis]:n})))}
        {number('scale',object.scale,0.25,3,0.25,scale=>changeObject({scale}))}{number('yaw',object.yaw,-180,180,5,yaw=>changeObject({yaw}))}{colors(object.color,color=>changeObject({color}))}
        <button type="button" className={button} onClick={()=>{onChange({...value,objects:value.objects.filter(o=>o!==object)});setSelected(0);}}>{text('remove')}</button></fieldset>}
      <div className="flex gap-2">{value.lights.map((_,i)=><button type="button" key={i} className={button} aria-pressed={i===light} onClick={()=>setLight(i)}>{text('light')} {i+1}</button>)}</div>
      {(['x','y','z'] as const).map(axis=>number(axis,value.lights[light][axis],axis==='y'?0.5:-8,axis==='y'?10:8,0.5,n=>changeLight({[axis]:n})))}
      {number('intensity',value.lights[light].intensity,0,5,0.25,intensity=>changeLight({intensity}))}{number('diffusion',value.lights[light].radius,0,2,0.25,radius=>changeLight({radius}))}{colors(value.lights[light].color,color=>changeLight({color}))}
      <button type="button" className={button} onClick={()=>void capture()}>{text(busy?'saving':'useFrame')}</button>
    </fieldset>
    <p className="mt-2 text-xs opacity-70">{text('frameHint')}</p>
  </details>;
}
