import { archiveLayerSet, layerInput, layerManifest, layerOutputs } from './creator-image-layers.ts';
import { layerCanvas, validateLayerPng } from './creator-layer-png.ts';
import { hydrateGenerationResult } from './generation-result.ts';
const assert = (value: unknown) => { if (!value) throw new Error('Assertion failed'); };
async function rejects(action: () => unknown) { try { await action(); } catch { return; } throw new Error('Expected rejection'); }
function chunk(type: string, data = new Uint8Array()) {
  const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0, data.length); bytes.set(new TextEncoder().encode(type), 4); bytes.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of bytes.subarray(4, -4)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1; }
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
}
async function png(raw = new Uint8Array([0,0,0,0,0]), middle: Uint8Array[] = []) {
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0,1); view.setUint32(4,1); header[8]=8; header[9]=6;
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const parts = [new Uint8Array([137,80,78,71,13,10,26,10]), chunk('IHDR',header), chunk('IDAT',compressed), ...middle, chunk('IEND')];
  return new Uint8Array(await new Blob(parts.map(part => Uint8Array.from(part).buffer)).arrayBuffer());
}
Deno.test('fixed decomposition sends four PNG layers with safety enabled and no prompt synthesis', () => {
  assert(JSON.stringify(layerInput('https://owned/image')) === JSON.stringify({ image_url:'https://owned/image',num_layers:4,output_format:'png',num_inference_steps:28,guidance_scale:5,acceleration:'regular',enable_safety_checker:true,sync_mode:false }));
});
Deno.test('layer output rejects truncation, bad CRC, animation, noncontiguous data, invalid filters and decompression overflow', async () => {
  const good = await png(); assert((await validateLayerPng(good)).width === 1);
  await rejects(() => validateLayerPng(good.slice(0,33)));
  const bad = good.slice(); bad[30] ^= 1; await rejects(() => validateLayerPng(bad));
  await rejects(() => validateLayerPng(png as unknown as Uint8Array));
  await rejects(async () => validateLayerPng(await png(new Uint8Array([5,0,0,0,0]))));
  await rejects(async () => validateLayerPng(await png(new Uint8Array(1000))));
  await rejects(async () => validateLayerPng(await png(new Uint8Array(5), [chunk('tEXt'),chunk('IDAT')])));
  await rejects(async () => validateLayerPng(await png(new Uint8Array(5), [chunk('acTL',new Uint8Array(8))])));
  await rejects(() => layerCanvas(4096,4096));
});
Deno.test('provider results must include every safe layer on the allowed host', async () => {
  const result = { layerImages: Array.from({length:4},(_,index)=>({url:`https://v3.fal.media/layer-${index}.png`})),layerSafety:[false,false,false,false] };
  assert(layerOutputs(result).length===4);
  await rejects(()=>layerOutputs({...result,layerImages:result.layerImages.slice(1)}));
  await rejects(()=>layerOutputs({...result,layerSafety:[false,false,true,false]}));
  await rejects(()=>layerOutputs({...result,layerImages:result.layerImages.map(image=>({...image,url:'https://evil.invalid/a'}))}));
});
Deno.test('archive recovery reuses owner-scoped ready children and changes only delivery fields', async () => {
  const id='00000000-0000-4000-8000-000000000001';
  const images=Array.from({length:4},(_,index)=>({url:`https://fal.media/${index}.png`}));
  const result:any={status:'succeeded',layerImages:images,layerSafety:[false,false,false,false],layerSet:layerManifest(id,'source-asset',images),savePending:true};
  const immutable=JSON.stringify({...result,savePending:undefined});
  let index=-1,publishing=false; const eqs:unknown[]=[];
  const query:any={select(){if(publishing)return Promise.resolve({data:Array.from({length:4},()=>({id:'saved'})),error:null});index++;return this;},update(){publishing=true;return this;},in(){return this;},eq(key:string,value:unknown){eqs.push([key,value]);return this;},async maybeSingle(){return {data:{ready:true,storage_path:`owner/${id}-layer-${index}/original`,metadata:{layerSetId:id,layerIndex:index,width:1024,height:1024}},error:null};}};
  await archiveLayerSet({id,wallet_address:'owner'},result,{from:()=>query} as any);
  assert(result.libraryId===id && !result.savePending);
  const {libraryId,savePending,...after}=result; assert(JSON.stringify(after)===immutable);
  assert(eqs.filter((entry:any)=>entry[0]==='wallet_address'&&entry[1]==='owner').length===5);
});
Deno.test('a permanently invalid refunded layer job rehydrates as failed without exposing raw outputs', async () => {
  const result = await hydrateGenerationResult({ id:'job',status:'failed',result:{status:'failed',error:'Unsafe layers',paymentRestored:true,layerSet:{rawUrl:'https://fal.media/raw'}} },{} as any);
  assert(result.status==='failed' && result.paymentRestored===true && result.savePending===false && !result.layerSet);
});
Deno.test('a malformed final PNG never publishes the earlier staged children', async () => {
  const id='00000000-0000-4000-8000-000000000001', good=await png(), bad=good.slice();bad[30]^=1;
  const originalFetch=globalThis.fetch;let downloads=0,published=0;const staged:any[]=[];
  globalThis.fetch=async()=>new Response(downloads++===3?bad:good,{headers:{'content-type':'image/png'}});
  const query:any={select(){return this;},eq(){return this;},async maybeSingle(){return {data:null,error:null};},async upsert(row:any){staged.push(row);return {error:null};},update(){published++;return this;},in(){return this;}};
  const db:any={from:()=>query,storage:{from:()=>({upload:async()=>({error:null})})}};
  const images=Array.from({length:4},(_,index)=>({url:`https://fal.media/${index}.png`}));
  try {
    await rejects(()=>archiveLayerSet({id,wallet_address:'owner',created_at:'2026-10-28'}, {layerImages:images,layerSafety:[false,false,false,false],layerSet:layerManifest(id,'source-asset',images)},db));
    assert(staged.length===3 && staged.every(row=>row.ready===false&&row.metadata.layerValidated===true));assert(published===0);
  } finally {globalThis.fetch=originalFetch;}
});
