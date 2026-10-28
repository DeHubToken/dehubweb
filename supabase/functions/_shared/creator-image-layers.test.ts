import { archiveLayerSet, layerInput, layerManifest, layerOutputs } from './creator-image-layers.ts';
import { layerCanvas, validateLayerPng } from './creator-layer-png.ts';
import { hydrateGenerationResult } from './generation-result.ts';
import { prepareLayerSource, layerSourceFormat } from './creator-layer-source.ts';
import { retryGenerationSave, settleGeneration } from './generation-jobs.ts';
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
Deno.test('source accepts complete PNG only and rejects header-only JPEG/WebP', async () => {
  assert(await layerSourceFormat(await png())==='image/png');
  await rejects(()=>layerSourceFormat(new Uint8Array([255,216,255,192,0,8,8,0,1,0,1,3,255,217])));
  const webp=new Uint8Array(30);webp.set(new TextEncoder().encode('RIFF'));new DataView(webp.buffer).setUint32(4,22,true);webp.set(new TextEncoder().encode('WEBPVP8X'),8);
  await rejects(()=>layerSourceFormat(webp));
});
Deno.test('review binds an immutable private source and rejects another owner or changed digest', async () => {
  const good=await png(), objects=new Map<string,Uint8Array>([['owner/source-image/original',good]]), paths:string[]=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async input=>{const path=new URL(String(input)).pathname.slice(1), bytes=objects.get(path);return bytes?new Response(Uint8Array.from(bytes).buffer):new Response('missing',{status:404});};
  const query:any={select(){return this;},eq(){return this;},async maybeSingle(){return {data:{metadata:{kind:'image'},storage_path:'owner/source-image/original'},error:null};}};
  const db:any={from:()=>query,storage:{from:()=>({createSignedUrl:async(path:string)=>{paths.push(path);return {data:{signedUrl:`https://private.test/${path}`},error:null};},upload:async(path:string,blob:Blob)=>{objects.set(path,new Uint8Array(await blob.arrayBuffer()));return {error:null};}})}};
  try {
    const prepared=await prepareLayerSource('owner','source-image',undefined,db);
    objects.set('owner/source-image/original',new Uint8Array([1,2,3]));
    const recovered=await prepareLayerSource('owner','source-image',prepared.sourceDigest,db);
    assert(recovered.sourceDigest===prepared.sourceDigest && recovered.sourcePreviewUrl.includes('/__layer_sources/'));
    await rejects(()=>prepareLayerSource('other','source-image',prepared.sourceDigest,db));
    const wrong='0'.repeat(64);objects.set(`owner/__layer_sources/source-image/${wrong}/original`,good);
    await rejects(()=>prepareLayerSource('owner','source-image',wrong,db));
    assert(paths.some(path=>path.startsWith('other/__layer_sources/')));
  } finally {globalThis.fetch=originalFetch;}
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
  await archiveLayerSet({id,wallet_address:'owner',status:'succeeded'},result,{from:()=>query} as any);
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

async function deliveryRaceFixture(cancelDuringStage: boolean, failFirstPublish: boolean) {
  const id='00000000-0000-4000-8000-000000000001', bytes=await png();
  const images=Array.from({length:4},(_,index)=>({url:`https://fal.media/${index}.png`}));
  const raw:any={status:'processing',providerCompleted:true,savePending:true,layerImages:images,layerSafety:[false,false,false,false],layerSet:layerManifest(id,'source-image',images)};
  const job:any={id,wallet_address:'owner',status:'processing',model:'qwen-image-layered',created_at:'2026-10-28',result:raw};
  const rows=new Map<string,any>();let published=0,downloads=0;
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{downloads++;return new Response(bytes);};
  const db:any={from:(table:string)=>{
    const filters:Record<string,any>={};let update:any;
    const query:any={eq(key:string,value:any){filters[key]=value;return this;},in(){return this;},
      select(){if(update){if(failFirstPublish){failFirstPublish=false;return Promise.resolve({data:null,error:new Error('storage publication unavailable')});}for(const row of rows.values())row.ready=true;published++;return Promise.resolve({data:[...rows.values()].map(row=>({id:row.id})),error:null});}return this;},
      update(value:any){update=value;return this;},
      async maybeSingle(){return {data:table==='ai_generation_jobs'?(!filters.status||job.status===filters.status?structuredClone(job):null):rows.get(filters.id)||null,error:null};},
      async single(){return {data:structuredClone(job),error:null};},
      async upsert(row:any){rows.set(row.id,row);if(cancelDuringStage&&rows.size===4){job.status='refund_pending';job.result={...raw,status:'cancelled',paymentRestored:false};}return {error:null};}};return query;},
    storage:{from:()=>({upload:async()=>({error:null}),createSignedUrl:async(path:string)=>({data:{signedUrl:`https://private.test/storage/v1/object/sign/creator-assets/${path}`},error:null})})},
    rpc:async(name:string,args:any)=>{
      if(name==='ai_generation_transition'){
        if(['succeeded','failed','cancelled','refund_pending'].includes(job.status))return {data:{claimed:false,job:structuredClone(job)},error:null};
        job.status=args.p_status;job.result={...args.p_result,...(job.status==='succeeded'?{savePending:true}:{})};return {data:{claimed:true,job:structuredClone(job)},error:null};
      }
      if(name==='ai_generation_save_result'){
        assert(job.status==='succeeded');const strip=(value:any)=>{const {libraryId,savePending,...rest}=value;return rest;};
        assert(JSON.stringify(strip(args.p_expected_result))===JSON.stringify(strip(args.p_result)));job.result=structuredClone(args.p_result);return {data:true,error:null};
      }
      throw new Error(`Unexpected RPC ${name}`);
    }};
  return {job,rows,db,response:()=>new Response(JSON.stringify({...raw,status:'succeeded'})),published:()=>published,downloads:()=>downloads,restore:()=>{globalThis.fetch=originalFetch;}};
}
Deno.test('cancellation winning during staging prevents publication of every usable layer',async()=>{
  const fixture=await deliveryRaceFixture(true,false);
  try {
    const response=await settleGeneration('fal-ai-tools','ticket',fixture.response(),fixture.db);
    assert(fixture.job.status==='refund_pending'&&fixture.published()===0&&fixture.rows.size===4);
    assert([...fixture.rows.values()].every(row=>row.ready===false));
    assert((await response.json()).savePending===false);
  }finally{fixture.restore();}
});
Deno.test('success owns delivery before publication; failed publication retries staged bytes without provider replay',async()=>{
  const fixture=await deliveryRaceFixture(false,true);
  try{
    await settleGeneration('fal-ai-tools','ticket',fixture.response(),fixture.db);
    assert(fixture.job.status==='succeeded'&&fixture.job.result.savePending===true&&fixture.published()===0);
    assert([...fixture.rows.values()].every(row=>row.ready===false));
    await retryGenerationSave(fixture.job,fixture.db);
    assert(!fixture.job.result.savePending&&fixture.published()===1&&fixture.downloads()===4);
    assert([...fixture.rows.values()].every(row=>row.ready===true));
  }finally{fixture.restore();}
});
