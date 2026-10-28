import { AVATAR_ENDPOINT, prepareAvatar, verifyAvatarQuote, avatarDeliveryReleased } from './creator-avatar.ts';
import { frameSpeechPcm, pcmSpeechSamples } from './speech-audio.ts';
import { quotePriceDhb } from './ai-pricing.ts';
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
async function rejects(operation: () => unknown) { let failed = false; try { await operation(); } catch { failed = true; } assert(failed, 'Malformed or changed input was accepted'); }
function encode(bytes: Uint8Array) { let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(value); }
function chunk(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0,data.length); bytes.set([...type].map(c=>c.charCodeAt(0)),4); bytes.set(data,8);
  let crc = 0xffffffff;
  for (const byte of bytes.subarray(4,bytes.length-4)) { crc ^= byte; for(let bit=0;bit<8;bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
  view.setUint32(bytes.length-4,(crc ^ 0xffffffff)>>>0); return bytes;
}
let image: string;
async function portrait() {
  if (image) return image;
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0,512); view.setUint32(4,512); header[8]=8; header[9]=6;
  const samples = new Uint8Array(512*(1+512*4));
  const compressed = new Uint8Array(await new Response(new Blob([samples]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const parts = [new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())];
  const bytes = new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length;}
  image='data:image/png;base64,'+encode(bytes); return image;
}
async function input(seconds = 5.25) {
  const pcm = new Uint8Array(Math.round(seconds*24000)*2); pcm[0]=123;
  return { imageDataUrl: await portrait(), audioDataUrl: 'data:audio/wav;base64,'+encode(new Uint8Array(frameSpeechPcm(pcm.buffer,24000))), rightsConfirmed:true };
}
Deno.test('avatar prepares exact whole-second PCM input and quotes only those provider seconds', async()=>{
  const source = await input(), result = await prepareAvatar(source,'A neutral expression');
  assert(result.durationSeconds===6);
  const prepared = Uint8Array.from(atob(result.input.audio_url.split(',')[1]),c=>c.charCodeAt(0));
  assert(pcmSpeechSamples(prepared.buffer,24000).durationSeconds===6);
  assert(prepared[44]===123 && prepared.slice(44+5.25*48000).every(byte=>byte===0));
  assert(quotePriceDhb('video','kling-avatar-v2',{durationSeconds:result.durationSeconds})===405);
  assert(AVATAR_ENDPOINT==='fal-ai/kling-video/ai-avatar/v2/standard');
  assert(Object.keys(result.input).sort().join(',')==='audio_url,enable_safety_checker,image_url,prompt');
  assert(result.input.enable_safety_checker===true);
});
Deno.test('quote binds exact prepared inputs and prompt, rejecting stale digest and accepted price',async()=>{
  const source=await input(), first=await prepareAvatar(source,'Speak'), same=await prepareAvatar(source,'Speak'), changed=await prepareAvatar(source,'Smile');
  assert(first.inputDigest===same.inputDigest && first.inputDigest!==changed.inputDigest);
  verifyAvatarQuote({...source,inputDigest:first.inputDigest,acceptedPriceDhb:405},first,405);
  await rejects(()=>verifyAvatarQuote({...source,inputDigest:first.inputDigest,acceptedPriceDhb:405},changed,405));
  await rejects(()=>verifyAvatarQuote({...source,inputDigest:first.inputDigest,acceptedPriceDhb:404},first,405));
});
Deno.test('remote, malformed, oversized, unauthorized and unbounded inputs are refused before payment',async()=>{
  const source=await input();
  for(const patch of [{imageDataUrl:'https://example.com/private.png'},{audioDataUrl:'https://example.com/audio.wav'},{rightsConfirmed:false},{imageDataUrl:'data:image/png;base64,AAAA'},{audioDataUrl:'data:audio/wav;base64,AAAA'},{imageDataUrl:'data:image/png;base64,'+'A'.repeat(8*1024*1024)}]) await rejects(()=>prepareAvatar({...source,...patch}));
  for(const seconds of [4.99,30.01]) await rejects(async()=>prepareAvatar(await input(seconds)));
});
Deno.test('PCM metadata, truncated files, trailing payloads and duplicate chunks cannot alter billable duration',async()=>{
  const source=await input();
  const bytes=Uint8Array.from(atob(source.audioDataUrl.split(',')[1]),c=>c.charCodeAt(0));
  for(const change of [
    (b:Uint8Array)=>{new DataView(b.buffer).setUint16(20,3,true);return b;},
    (b:Uint8Array)=>{new DataView(b.buffer).setUint16(22,2,true);return b;},
    (b:Uint8Array)=>{new DataView(b.buffer).setUint32(24,44100,true);return b;},
    (b:Uint8Array)=>{new DataView(b.buffer).setUint32(28,1,true);return b;},
    (b:Uint8Array)=>b.slice(0,-1),
    (b:Uint8Array)=>{const out=new Uint8Array(b.length+1);out.set(b);return out;},
    (b:Uint8Array)=>{const out=new Uint8Array(b.length+8);out.set(b);out.set([100,97,116,97,0,0,0,0],b.length);new DataView(out.buffer).setUint32(4,out.length-8,true);return out;},
  ]) await rejects(()=>prepareAvatar({...source,audioDataUrl:'data:audio/wav;base64,'+encode(change(bytes.slice()))}));
});
Deno.test('PNG bytes and CRC must validate, not only its claimed MIME type and dimensions',async()=>{
  const source=await input(), bytes=Uint8Array.from(atob(source.imageDataUrl.split(',')[1]),c=>c.charCodeAt(0));
  bytes[32]^=1;
  await rejects(()=>prepareAvatar({...source,imageDataUrl:'data:image/png;base64,'+encode(bytes)}));
});
Deno.test('PNG rejects unknown critical chunks and nonconsecutive compressed data even with valid CRCs',async()=>{
  const source=await input(), bytes=Uint8Array.from(atob(source.imageDataUrl.split(',')[1]),c=>c.charCodeAt(0));
  const parts: Uint8Array[]=[];
  for(let pos=8;pos<bytes.length;) { const size=new DataView(bytes.buffer).getUint32(pos);parts.push(bytes.slice(pos,pos+12+size));pos+=12+size; }
  const packed=(chunks:Uint8Array[])=>{const out=new Uint8Array(8+chunks.reduce((n,c)=>n+c.length,0));out.set(bytes.slice(0,8));let pos=8;for(const c of chunks){out.set(c,pos);pos+=c.length;}return 'data:image/png;base64,'+encode(out);};
  const [header,data,end]=parts, compressed=data.slice(8,-4), middle=Math.floor(compressed.length/2);
  for(const chunks of [
    [header,chunk('ABCD',new Uint8Array()),data,end],
    [header,chunk('IDAT',compressed.slice(0,middle)),chunk('tEXt',new Uint8Array()),chunk('IDAT',compressed.slice(middle)),end],
    [header,data,chunk('PLTE',new Uint8Array(3)),end],
    [header,chunk('PLTE',new Uint8Array(3)),chunk('PLTE',new Uint8Array(3)),data,end],
    [header,chunk('abca',new Uint8Array()),data,end],
  ]) await rejects(()=>prepareAvatar({...source,imageDataUrl:packed(chunks)}));
  await prepareAvatar({...source,imageDataUrl:packed([header,chunk('IDAT',compressed.slice(0,middle)),chunk('IDAT',compressed.slice(middle)),end])});
});
Deno.test('new paid input is released only after durable output or confirmed refund',()=>{
  assert(!avatarDeliveryReleased({status:'succeeded',result:{savePending:true}}));
  assert(!avatarDeliveryReleased({status:'succeeded',result:{libraryId:'saved',savePending:true}}));
  assert(!avatarDeliveryReleased({status:'failed',result:{paymentRestored:false}}));
  assert(!avatarDeliveryReleased({status:'refund_pending',result:{paymentRestored:true}}));
  assert(avatarDeliveryReleased({status:'succeeded',result:{libraryId:'saved'}}));
  assert(avatarDeliveryReleased({status:'failed',result:{paymentRestored:true}}));
});
