export type RemixMode = 'green-screen' | 'duet' | 'sound' | 'stitch';
export type DuetLayout = 'side' | 'stacked' | 'pip' | 'behind';
/** Longest duet take; long sources record at a lower bitrate to stay under the upload cap. */
export const DUET_MAX_SECONDS = 180;
export interface RemixStudioConfig {
  mode: RemixMode;
  videoUrl: string;
  sourceUrl: string;
  title: string;
  creator?: string;
  /** Initial duet layout. */
  layout?: DuetLayout;
  bridgeKey: string;
}

/** Shared by the web recorder and the native WebView. Camera frames stay on device. */
export function buildRemixStudioHtml(config: RemixStudioConfig): string {
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta charset="utf-8"><style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#101010;color:#fff;font:14px system-ui,sans-serif}button,select,input{font:inherit}button,select{border:1px solid #444;border-radius:12px;background:#262626;color:#fff;padding:10px 14px}button:disabled{opacity:.4}button.primary{background:#fff;color:#111;font-weight:700}header,.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}header{padding:12px 16px;justify-content:space-between}h1{font-size:18px;margin:0}.stage{height:min(51vh,540px);display:flex;justify-content:center;background:#000}canvas{height:100%;max-width:100%;object-fit:contain;touch-action:none}section{max-width:680px;margin:auto;padding:12px 16px}label{display:flex;align-items:center;gap:8px;margin:8px 0}input[type=range]{flex:1;min-width:70px;accent-color:#ddd}small,#status{color:#bbb}#status{min-height:22px;margin:8px 0}#status.error{color:#ffb4ab}video.capture{position:fixed;width:2px;height:2px;left:0;top:0;opacity:.01;pointer-events:none}#review{width:100%;max-height:51vh;background:#000}#credit{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:85vw}fieldset{border:0;padding:0;margin:0}output{min-width:42px;font-variant-numeric:tabular-nums}#clock{font-variant-numeric:tabular-nums;font-size:17px}a{color:inherit}.track{position:relative;height:40px;border-radius:10px;background:#262626;margin:4px 0 8px;touch-action:none;cursor:pointer;overflow:hidden}.window{position:absolute;top:0;bottom:0;border:2px solid #fff;border-radius:10px;background:rgba(255,255,255,.2)}.grip{position:absolute;right:0;top:0;bottom:0;width:18px;background:#fff;cursor:ew-resize}.playhead{position:absolute;top:0;bottom:0;width:2px;background:#ffd34d;pointer-events:none}.upload{display:inline-flex;align-items:center;border:1px solid #444;border-radius:12px;background:#262626;padding:10px 14px;cursor:pointer;margin:0}.upload input{position:absolute;width:1px;height:1px;opacity:0}</style></head><body>
<header><h1 id="title"></h1><button id="close" aria-label="Close remix">Close</button></header>
<div class="stage" id="stage"><canvas id="canvas" width="720" height="1280" aria-label="Live remix preview"></canvas></div><video id="review" controls playsinline hidden></video>
<section><div id="credit"></div><p id="status" role="status" aria-live="polite">Loading source video…</p>
<fieldset id="settings"><div id="trimmer" hidden><small>Drag the box to pick the part you want, drag its edge to change the length.</small><div class="track" id="track" role="presentation"><div class="window" id="window"><span class="grip" id="grip"></span></div><div class="playhead" id="playhead"></div></div></div><label>Start <input id="trim" type="range" min="0" max="0" step="0.1" value="0"><output id="trimValue">0.0s</output></label>
<div class="row"><label>Length <select id="length"><option value="15">15 seconds</option><option value="60">60 seconds</option></select></label><label id="cutLabel" hidden>Clip <input id="cutLength" type="range" min="1" max="5" step="0.1" value="5"><output id="cutValue">5.0s</output></label><label id="layoutLabel">Layout <select id="layout"></select></label></div>
<label>Source volume <input id="sourceVolume" type="range" min="0" max="1" step="0.05" value="0.7"></label><label>Microphone <input id="micVolume" type="range" min="0" max="1" step="0.05" value="1"></label>
<div class="row"><button id="sample" disabled>Play sample</button><button id="camera" disabled>Enable camera</button><button id="flip" disabled>Flip camera</button><label><input id="countdown" type="checkbox" checked>3 sec timer</label><label class="upload" id="uploadLabel" hidden><input id="upload" type="file" accept="video/*">Upload a clip</label><button id="clearUpload" hidden>Use camera instead</button></div>
<small id="hint"></small></fieldset>
<div class="row" style="margin-top:12px"><button class="primary" id="record" disabled>Record</button><button id="stop" hidden>Stop</button><strong id="clock"></strong><button id="retake" hidden>Retake</button><button class="primary" id="use" hidden>Use video</button></div>
</section><video id="source" class="capture" playsinline crossorigin="anonymous" preload="auto"></video><video id="cameraVideo" class="capture" autoplay playsinline muted></video><video id="uploadVideo" class="capture" playsinline preload="auto"></video>
<script>const config = ${json};</script><script type="module">${REMIX_STUDIO_RUNTIME}</script></body></html>`;
}

export const REMIX_STUDIO_RUNTIME = String.raw`
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), source = $('source'), camera = $('cameraVideo'), upload = $('uploadVideo');
const mask = document.createElement('canvas'), person = document.createElement('canvas');
const maskCtx = mask.getContext('2d'), personCtx = person.getContext('2d');
let stream = null, segmenter = null, audio = null, mix = null, sourceGain = null, micGain = null, monitor = null, micNode = null;
let recorder = null, capture = null, result = null, resultUrl = null, chunks = [], recordedBytes = 0, lastFrame = -1;
let ready = false, busy = false, recording = false, counting = false, draining = false, closed = false, discarded = false, facing = 'user';
let started = 0, measured = 0, samplePlaying = false, animation = 0, countTimer = 0, recordTimer = 0, drainTimer = 0;
let uploadUrl = null, uploaded = false, uploadGain = null, uploadStarted = false, trimDrag = null;
/** A slow encoder runs behind the canvas; stopping at once drops its backlog, so a finished take waits this long. */
const DRAIN_MS = 1200;
let subject = {x:.5,y:.6,scale:.8}, pointers = new Map(), pinch = null;
const names = {'green-screen':'Green screen',duet:'Duet',sound:'Use this sound',stitch:'Stitch'};
const stitch = config.mode==='stitch', MAX_REPLY = 60;
const DUET_MAX = ${DUET_MAX_SECONDS};
const MAX_BYTES = 24 * 1024 * 1024;
function send(type, data = {}) { const packet = {key:config.bridgeKey,type,...data}; if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(packet)); else parent.postMessage(packet, '*'); }
function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
function limit() { return $('length').value==='full' ? DUET_MAX : Number($('length').value); }
function range() { const start = Number($('trim').value), remaining = Math.max(0, source.duration - start); return {start, duration:Math.min(limit(),remaining), cut:Math.min(Number($('cutLength').value),remaining)}; }
/** Stitch: the source clip, then the reply (an uploaded clip plays in full, a camera take up to the chosen length). */
function total() { const r=range(); return stitch ? r.cut+(uploaded?Math.min(MAX_REPLY,upload.duration):Math.min(MAX_REPLY,limit())) : r.duration; }
function duetLayout() { return config.mode==='duet' ? $('layout').value : ''; }
function needsSegmenter() { return config.mode==='green-screen' || duetLayout()==='behind'; }
function movable() { return config.mode==='green-screen' || duetLayout()==='behind' || duetLayout()==='pip'; }
function liveError(error) { if(closed)return; status(error.message || String(error), true); if(recording) stop(true); send('error',{error:error.message || String(error)}); }
function controls() { $('settings').disabled = busy || recording || counting || draining || !!result; $('record').disabled = !ready || !(stream || uploaded) || busy || counting || draining || !!result; $('camera').disabled = !ready || busy || uploaded; $('clearUpload').hidden = !uploaded; $('length').closest('label').hidden = stitch && uploaded; $('flip').disabled = !stream || busy; $('stop').hidden = !recording && !counting; $('record').hidden = recording || counting || draining || !!result; $('retake').hidden = !result; $('use').hidden = !result; }
function cover(context, image, x,y,w,h, mirror = false) {
  const iw=image.videoWidth || image.width, ih=image.videoHeight || image.height; if(!iw || !ih)return;
  const scale=Math.max(w/iw,h/ih), sw=w/scale, sh=h/scale;
  context.save(); context.beginPath(); context.rect(x,y,w,h); context.clip();
  if(mirror){ context.translate(x+w,y);context.scale(-1,1);x=0;y=0; }
  context.drawImage(image,(iw-sw)/2,(ih-sh)/2,sw,sh,x,y,w,h);context.restore();
}
function drawPerson(now,w,h) {
      if(camera.currentTime!==lastFrame) {
        lastFrame=camera.currentTime;
        try { segmenter.segmentForVideo(camera,now,seg => {
          const masks=seg.confidenceMasks, foreground=masks && (masks.length>1 ? masks[1] : masks[0]);
          if(!foreground)throw new Error('The camera mask is unavailable.');
          const pixels=foreground.getAsFloat32Array(); mask.width=foreground.width;mask.height=foreground.height;
          const rgba=maskCtx.createImageData(mask.width,mask.height);
          for(let i=0;i<pixels.length;i++){rgba.data[i*4]=255;rgba.data[i*4+1]=255;rgba.data[i*4+2]=255;rgba.data[i*4+3]=Math.round(Math.max(0,Math.min(1,(pixels[i]-.15)/.7))*255);}
          maskCtx.putImageData(rgba,0,0);
          person.width=480;person.height=Math.round(480*camera.videoHeight/camera.videoWidth);
          personCtx.drawImage(camera,0,0,person.width,person.height);personCtx.globalCompositeOperation='destination-in';personCtx.drawImage(mask,0,0,person.width,person.height);personCtx.globalCompositeOperation='source-over';
        }); } catch(error){liveError(error);stream?.getTracks().forEach(t=>t.stop());stream=null;segmenter?.close();segmenter=null;controls();return false;}
      }
      const ph=h*subject.scale,pw=ph*person.width/Math.max(1,person.height);ctx.save();ctx.translate(w*subject.x,h*subject.y);if(facing==='user')ctx.scale(-1,1);ctx.drawImage(person,-pw/2,-ph/2,pw,ph);ctx.restore();
  return true;
}
function draw(now) {
  if(closed)return; animation=requestAnimationFrame(draw);
  if(result || draining)return;
  const w=canvas.width,h=canvas.height,r=range(), elapsed=recording?(now-started)/1000:0;
  if(recording && elapsed >= total()){stop();return;}
  if(recording && stitch && elapsed>=r.cut){ source.pause(); if(sourceGain)sourceGain.gain.value=0; if(uploaded && !uploadStarted){uploadStarted=true;upload.currentTime=0;if(uploadGain)uploadGain.gain.value=1;upload.play().catch(liveError);} }
  if(samplePlaying && source.currentTime>=r.start+(stitch?r.cut:r.duration)){source.pause();samplePlaying=false;}
  if(stitch && source.duration)$('playhead').style.left=(100*source.currentTime/source.duration)+'%';
  ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
  const cameraReady=camera.readyState>=2 && stream;
  if(config.mode==='green-screen' || duetLayout()==='behind') {
    cover(ctx,source,0,0,w,h);
    if(cameraReady && segmenter && !drawPerson(now,w,h))return;
  } else if(duetLayout()==='pip') {
    cover(ctx,source,0,0,w,h);
    if(cameraReady){const pw=w*.36*subject.scale/.48,ph=pw*16/9,px=Math.max(0,Math.min(w-pw,w*subject.x-pw/2)),py=Math.max(0,Math.min(h-ph,h*subject.y-ph/2));ctx.save();ctx.beginPath();ctx.roundRect(px,py,pw,ph,24);ctx.clip();cover(ctx,camera,px,py,pw,ph,facing==='user');ctx.restore();ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(px,py,pw,ph,24);ctx.stroke();}
  } else if(config.mode==='duet') {
    const stacked=$('layout').value==='stacked';cover(ctx,source,0,0,stacked?w:w/2,stacked?h/2:h);
    if(cameraReady)cover(ctx,camera,stacked?0:w/2,stacked?h/2:0,stacked?w:w/2,stacked?h/2:h,facing==='user');
  } else if(stitch && (!recording || elapsed<r.cut)) cover(ctx,source,0,0,w,h);
  else if(stitch && uploaded)cover(ctx,upload,0,0,w,h);
  else if(cameraReady)cover(ctx,camera,0,0,w,h,facing==='user');
  else if(config.mode==='sound')cover(ctx,source,0,0,w,h);
  if(micGain)micGain.gain.value=uploaded || (recording && stitch && elapsed<r.cut)?0:Number($('micVolume').value);
  if(recording)$('clock').textContent=elapsed.toFixed(1)+'s';
}
function waitMedia(element,event,begin) { return new Promise((resolve,reject)=>{let timer;const finish=error=>{clearTimeout(timer);element.removeEventListener(event,done);element.removeEventListener('error',failed);error?reject(error):resolve();};const done=()=>finish(),failed=()=>finish(new Error('This source video could not be opened.'));element.addEventListener(event,done,{once:true});element.addEventListener('error',failed,{once:true});timer=setTimeout(()=>finish(new Error('The video took too long to load. Try again.')),25000);try{begin();}catch(error){finish(error);}}); }
async function seek() {const time=range().start;if(Math.abs(source.currentTime-time)<.03 && source.readyState>=2)return;await waitMedia(source,'seeked',()=>source.currentTime=time);}
async function initAudio() {
  if(!audio){audio=new AudioContext();mix=audio.createMediaStreamDestination();sourceGain=audio.createGain();monitor=audio.createGain();sourceGain.gain.value=Number($('sourceVolume').value);monitor.gain.value=0;audio.createMediaElementSource(source).connect(sourceGain);sourceGain.connect(mix);sourceGain.connect(monitor);monitor.connect(audio.destination);source.muted=false;}
  if(stitch && !uploadGain){uploadGain=audio.createGain();uploadGain.gain.value=0;audio.createMediaElementSource(upload).connect(uploadGain);uploadGain.connect(mix);uploadGain.connect(monitor);upload.muted=false;}
  await audio.resume();
}
async function loadSegmenter() {
  if(segmenter)return;
  status('Preparing live background removal…');
  const {FilesetResolver,ImageSegmenter}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
  const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
  const task=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite'},runningMode:'VIDEO',outputConfidenceMasks:true,outputCategoryMask:false});
  if(closed || segmenter){task.close();return;}segmenter=task;
}
async function enableCamera() {
  if(busy || closed)return;busy=true;controls();status('Opening camera…');
  try {
    await initAudio();
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;camera.srcObject=null;}
    const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:720},height:{ideal:1280},frameRate:{ideal:24,max:30}},audio:{echoCancellation:true,noiseSuppression:true}});
    if(closed){next.getTracks().forEach(t=>t.stop());return;}
    if(stream)stream.getTracks().forEach(t=>t.stop());if(micNode)micNode.disconnect();stream=next;camera.srcObject=next;await camera.play();
    micGain ||= audio.createGain();micNode=audio.createMediaStreamSource(next);micNode.connect(micGain);micGain.disconnect();micGain.connect(mix);
    if(needsSegmenter())await loadSegmenter();
    if(closed)return;
    lastFrame=-1;status('Ready. Use headphones to keep the source out of your microphone.');
  }catch(error){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}liveError(error);}
  finally{busy=false;controls();}
}
async function start() {
  if(recording || counting || busy || !ready || !(stream || uploaded))return;
  counting=true;controls();source.pause();samplePlaying=false;upload.pause();uploadStarted=false;if(uploadGain)uploadGain.gain.value=0;
  try {
    await initAudio();await seek();
    if($('countdown').checked){for(let n=3;n>0;n--){if(!counting || closed)return;status(String(n));await new Promise(resolve=>{countTimer=setTimeout(resolve,1000);});}}
    if(!counting || closed)return;
    chunks=[];recordedBytes=0;discarded=false;result=null;capture=canvas.captureStream(24);
    for(const track of mix.stream.getAudioTracks())capture.addTrack(track.clone());
    const mime=['video/webm;codecs=vp8,opus','video/mp4','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime)throw new Error('Video recording is unavailable on this device.');
    const planned=total();
    recorder=new MediaRecorder(capture,{mimeType:mime,videoBitsPerSecond:Math.max(500000,Math.min(2000000,Math.floor(MAX_BYTES*8*.8/Math.max(1,planned))-128000)),audioBitsPerSecond:128000});
    recorder.ondataavailable=event=>{if(event.data.size){recordedBytes+=event.data.size;if(recordedBytes>MAX_BYTES){discarded=true;liveError(new Error('Recording is too large. Please use a shorter take.'));return;}chunks.push(event.data);}};
    recorder.onerror=()=>liveError(new Error('Recording failed. Please try another take.'));
    recorder.onstop=()=>{capture?.getTracks().forEach(t=>t.stop());capture=null;source.pause();upload.pause();if(monitor)monitor.gain.value=0;if(!discarded && chunks.length && measured>.25){result=new Blob(chunks,{type:mime.split(';')[0]});resultUrl=URL.createObjectURL(result);$('review').src=resultUrl;$('review').hidden=false;$('stage').hidden=true;status('Review your take before using it.');}chunks=[];controls();};
    sourceGain.gain.value=Number($('sourceVolume').value);monitor.gain.value=1;
    await source.play();if(closed || !counting){source.pause();capture?.getTracks().forEach(t=>t.stop());capture=null;return;}
    started=performance.now();recording=true;counting=false;recorder.start(500);controls();status('Recording');
    recordTimer=setTimeout(()=>stop(),1000*total()+250);
  }catch(error){counting=false;recording=false;capture?.getTracks().forEach(t=>t.stop());capture=null;source.pause();if(monitor)monitor.gain.value=0;liveError(error);controls();}
}
function stop(discard=false){discarded ||= discard;counting=false;clearTimeout(recordTimer);const wasRecording=recording;if(recording)measured=Math.min(total(),(performance.now()-started)/1000);recording=false;source.pause();upload.pause();if(monitor)monitor.gain.value=0;
  if(recorder && recorder.state!=='inactive'){
    if(wasRecording && !discarded){
      // Freeze the picture (no repaint, no new frames) and silence the mix while the encoder catches up; the editor trims the take to its measured length.
      draining=true;capture?.getAudioTracks().forEach(t=>{t.enabled=false;});controls();status('Finishing your take…');
      drainTimer=setTimeout(()=>{draining=false;if(recorder && recorder.state!=='inactive')recorder.stop();},DRAIN_MS);
    }else{clearTimeout(drainTimer);draining=false;recorder.stop();}
  }else{capture?.getTracks().forEach(t=>t.stop());capture=null;controls();}}
function dispose(){if(closed)return;closed=true;stop(true);clearTimeout(countTimer);cancelAnimationFrame(animation);stream?.getTracks().forEach(t=>t.stop());stream=null;segmenter?.close();segmenter=null;audio?.close();if(resultUrl)URL.revokeObjectURL(resultUrl);if(uploadUrl)URL.revokeObjectURL(uploadUrl);source.removeAttribute('src');source.load();}
$('title').textContent=names[config.mode] || 'Remix';$('credit').textContent='Source: '+(config.creator ? '@'+config.creator+' · ' : '')+config.title;
$('hint').textContent=config.mode==='green-screen'?'Your background is removed live. Drag to move yourself; pinch or scroll to resize.':config.mode==='duet'?'Records for the length of the video. Drag to move yourself in Picture in picture and Green screen behind.':stitch?'Pick up to 5 seconds of this video, then record or upload your reply. They play back to back as one video.':'Choose your source range and layout, then record your response.';
if(config.mode==='duet'){$('length').add(new Option('Full video','full'),0);$('length').value='full';}
$('cutLabel').hidden=!stitch;$('trimmer').hidden=!stitch;$('uploadLabel').hidden=!stitch;$('layoutLabel').hidden=config.mode==='sound'||stitch;
if(stitch)$('length').closest('label').firstChild.textContent='Reply ';
for(const [value,label] of (config.mode==='duet'?[['side','Left / right'],['stacked','Top / bottom'],['pip','Picture in picture'],['behind','Green screen behind']]:[['full','Full screen'],['corner','Corner'],['square','Square']])){$('layout').add(new Option(label,value));}
if(config.mode==='duet' && ['side','stacked','pip','behind'].includes(config.layout))$('layout').value=config.layout;
function applyLayout(){const value=$('layout').value;canvas.height=value==='square'?720:1280;subject=value==='corner'||value==='pip'?{x:.78,y:.76,scale:.48}:{x:.5,y:.6,scale:.8};}
applyLayout();
$('layout').onchange=async()=>{applyLayout();if(stream && needsSegmenter() && !segmenter){busy=true;controls();try{await loadSegmenter();status('Ready. Use headphones to keep the source out of your microphone.');}catch(error){liveError(error);}finally{busy=false;controls();}}};
$('trim').oninput=()=>{$('trimValue').textContent=Number($('trim').value).toFixed(1)+'s';source.pause();samplePlaying=false;source.currentTime=Number($('trim').value);trimWindow();};
$('cutLength').oninput=()=>{$('cutValue').textContent=Number($('cutLength').value).toFixed(1)+'s';trimWindow();};
/** The box on the track is the stitched part: its left edge is Start, its width is Clip. */
function trimWindow(){if(!source.duration)return;const r=range();$('window').style.left=(100*r.start/source.duration)+'%';$('window').style.width=(100*Math.max(r.cut,.1)/source.duration)+'%';$('trimValue').textContent=r.start.toFixed(1)+'s';$('cutValue').textContent=Number($('cutLength').value).toFixed(1)+'s';}
function trimAt(event){const box=$('track').getBoundingClientRect();return Math.max(0,Math.min(1,(event.clientX-box.left)/box.width))*source.duration;}
$('track').onpointerdown=event=>{if(!ready||$('settings').disabled)return;event.preventDefault();$('track').setPointerCapture(event.pointerId);const at=trimAt(event),start=Number($('trim').value);trimDrag=event.target.id==='grip'?{resize:true}:{offset:at>=start&&at<=start+Number($('cutLength').value)?at-start:Number($('cutLength').value)/2};$('track').onpointermove(event);};
$('track').onpointermove=event=>{if(!trimDrag)return;const at=trimAt(event);if(trimDrag.resize){$('cutLength').value=String(Math.max(1,Math.min(5,at-Number($('trim').value))));$('cutLength').oninput();return;}$('trim').value=String(Math.max(0,Math.min(Number($('trim').max),at-trimDrag.offset)));$('trim').oninput();};
$('track').onpointerup=$('track').onpointercancel=()=>{trimDrag=null;};
$('upload').onchange=()=>{const file=$('upload').files?.[0];$('upload').value='';if(!file)return;
  if(!/^video\//.test(file.type)||file.size>200*1024*1024){status('Choose a video file under 200 MB.',true);return;}
  busy=true;controls();status('Loading your clip…');if(uploadUrl)URL.revokeObjectURL(uploadUrl);uploadUrl=URL.createObjectURL(file);
  waitMedia(upload,'loadeddata',()=>{upload.src=uploadUrl;}).then(()=>{if(!Number.isFinite(upload.duration)||upload.duration<.25)throw new Error('That clip has no playable video.');if(upload.duration>MAX_REPLY+.5)throw new Error('Your clip must be 60 seconds or shorter.');uploaded=true;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;camera.srcObject=null;}status('Clip ready. Record to join it to the stitched part.');})
  .catch(error=>{uploaded=false;upload.removeAttribute('src');upload.load();liveError(error);}).finally(()=>{busy=false;controls();});};
$('clearUpload').onclick=()=>{uploaded=false;upload.pause();upload.removeAttribute('src');upload.load();if(uploadUrl)URL.revokeObjectURL(uploadUrl);uploadUrl=null;status('Enable your camera to record a reply.');controls();};
$('sourceVolume').oninput=()=>{if(sourceGain)sourceGain.gain.value=Number($('sourceVolume').value);};
$('sample').onclick=async()=>{try{await initAudio();await seek();monitor.gain.value=1;await source.play();samplePlaying=true;}catch(error){liveError(error);}};
$('camera').onclick=enableCamera;$('flip').onclick=()=>{facing=facing==='user'?'environment':'user';void enableCamera();};$('record').onclick=start;$('stop').onclick=()=>stop();
$('retake').onclick=()=>{if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;result=null;$('review').pause();$('review').removeAttribute('src');$('review').hidden=true;$('stage').hidden=false;$('clock').textContent='';status('Ready for another take.');controls();};
$('use').onclick=async()=>{if(!result || busy)return;busy=true;controls();$('use').disabled=true;status('Preparing your video…');try{const reader=new FileReader();reader.onload=()=>{send('recorded',{dataUrl:reader.result,duration:measured,mime:result.type,width:canvas.width,height:canvas.height,layout:duetLayout()||undefined});};reader.onerror=()=>{busy=false;$('use').disabled=false;liveError(new Error('Could not prepare the take.'));controls();};reader.readAsDataURL(result);}catch(error){busy=false;liveError(error);controls();}};
function hostMessage(event){let data=event.data;try{if(typeof data==='string')data=JSON.parse(data);}catch{return;}if(data?.key!==config.bridgeKey)return;if(data.type==='save-failed'){busy=false;$('use').disabled=false;status(data.error||'Could not save. Your take is ready to retry.',true);controls();}if(data.type==='dispose')dispose();}
window.addEventListener('message',hostMessage);document.addEventListener('message',hostMessage);
$('close').onclick=()=>{dispose();send('cancel');};window.addEventListener('pagehide',dispose);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(recording||counting)stop();stream?.getTracks().forEach(t=>t.stop());stream=null;source.pause();controls();status('Camera stopped while this screen was hidden. Enable it to continue.');}});
canvas.onpointerdown=event=>{if(!movable()||recording)return;canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});};
canvas.onpointermove=event=>{if(!pointers.has(event.pointerId))return;const before=pointers.get(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const box=canvas.getBoundingClientRect();if(pointers.size===1){subject.x=Math.max(0,Math.min(1,subject.x+(event.clientX-before.x)/box.width));subject.y=Math.max(0,Math.min(1,subject.y+(event.clientY-before.y)/box.height));}else{const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)subject.scale=Math.max(.2,Math.min(2,subject.scale*distance/pinch));pinch=distance;}};
canvas.onpointerup=canvas.onpointercancel=event=>{pointers.delete(event.pointerId);pinch=null;};canvas.onwheel=event=>{if(movable()&&!recording){event.preventDefault();subject.scale=Math.max(.2,Math.min(2,subject.scale-event.deltaY*.001));}};
source.addEventListener('error',()=>liveError(new Error('This video cannot be loaded for remixing. Try a different source.')));
source.addEventListener('waiting',()=>{if(recording && (!stitch||(performance.now()-started)/1000<range().cut))liveError(new Error('Source playback stalled. Please retry after it has loaded.'));});
try {
  if(!['green-screen','duet','sound','stitch'].includes(config.mode)||!/^https:\/\//.test(config.videoUrl))throw new Error('Invalid remix source.');
  if(!navigator.mediaDevices?.getUserMedia || !canvas.captureStream || typeof MediaRecorder==='undefined')throw new Error('Live recording is unavailable in this browser. Use the latest Chrome or the DeHub app.');
  await waitMedia(source,'loadeddata',()=>{source.src=config.videoUrl;source.muted=true;});
  if(!Number.isFinite(source.duration)||source.duration<.25)throw new Error('Choose a finished video with a known duration.');
  $('trim').max=String(Math.max(0,source.duration-(stitch?1:.5)));ready=true;$('sample').disabled=false;trimWindow();controls();status(stitch?'Pick the part to stitch, then enable your camera or upload a clip.':'Choose a source range, then enable your camera.');send('ready');animation=requestAnimationFrame(draw);
}catch(error){liveError(error);}
`;
