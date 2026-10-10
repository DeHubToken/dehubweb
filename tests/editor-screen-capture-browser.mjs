import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

assert(process.env.CAPTURE_BROWSER_ROOT, 'The hosted browser dependency directory is required');
const { chromium } = await import(pathToFileURL(resolve(process.env.CAPTURE_BROWSER_ROOT, 'node_modules/playwright/index.mjs')).href);
const directory = resolve('screen-capture-browser-results');
await mkdir(directory, { recursive: true });
const productionSource = await readFile('src/lib/editor/screenCapture.ts', 'utf8');
const browserSource = stripTypeScriptTypes(productionSource);
const microphone = resolve(directory, 'microphone.wav');

// A controlled microphone source distinguishes it from the captured tab's 440 Hz tone.
const rate = 48000, samples = rate * 20;
const wave = Buffer.alloc(44 + samples * 2);
wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(rate, 24); wave.writeUInt32LE(rate * 2, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
wave.write('data', 36); wave.writeUInt32LE(samples * 2, 40);
for (let index = 0; index < samples; index++) {
  const time = index / rate;
  const envelope = 0.55 + 0.45 * Math.sin(2 * Math.PI * 3 * time);
  wave.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 880 * time) * envelope * 16000), 44 + index * 2);
}
await writeFile(microphone, wave);

const sourceHTML = `<!doctype html><title>DeHub Capture Source</title>
<style>html,body{margin:0;overflow:hidden}canvas{display:block}button{position:fixed;left:140px;top:100px}</style>
<canvas width="360" height="240"></canvas><button>Play source</button>
<script>
const canvas=document.querySelector('canvas'), context=canvas.getContext('2d');
function draw(time){context.fillStyle=Math.floor(time/350)%2?'rgb(220,20,30)':'rgb(20,30,220)';context.fillRect(0,0,360,240);context.fillStyle='white';context.beginPath();context.arc(180+Math.sin(time/300)*70,120,16,0,Math.PI*2);context.fill();requestAnimationFrame(draw)}
requestAnimationFrame(draw);
document.querySelector('button').onclick=async event=>{const audio=new AudioContext();await audio.resume();const tone=audio.createOscillator(),gain=audio.createGain();tone.frequency.value=440;gain.gain.value=.4;tone.connect(gain);gain.connect(audio.destination);tone.start();event.target.remove();window.sourceAudio=audio;window.sourceRunning=true};
</script>`;
const captureHTML = `<!doctype html><title>DeHub Capture Recorder</title>
<button id="start">Record screen and voiceover</button><button id="stop">Save recording</button>
<script type="module">
import {startScreenCapture} from '/capture.js';
window.originalTracks=[];window.current=true;
// Observe real streams without substituting devices, stream contents, or browser APIs.
for(const method of ['getDisplayMedia','getUserMedia']){const original=navigator.mediaDevices[method].bind(navigator.mediaDevices);navigator.mediaDevices[method]=(...args)=>original(...args).then(stream=>{window.originalTracks.push(...stream.getTracks());return stream})}
document.querySelector('#start').onclick=()=>{
  window.capture=startScreenCapture(true,()=>window.current);
  window.recording=window.capture.ready.then(stream=>{
    window.output=stream;
    const type='video/webm;codecs=vp8,opus';
    if(!MediaRecorder.isTypeSupported(type))throw new Error('Recording codec unavailable');
    const recorder=new MediaRecorder(stream,{mimeType:type}),chunks=[];window.recorder=recorder;
    window.saved=new Promise((resolve,reject)=>{recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};recorder.onerror=event=>reject(event.error);recorder.onstop=()=>resolve(new Blob(chunks,{type}))});
    recorder.start(100);return {video:stream.getVideoTracks().length,audio:stream.getAudioTracks().length,settings:stream.getVideoTracks()[0].getSettings(),originalAudio:window.originalTracks.filter(track=>track.kind==='audio').length};
  }).catch(error=>{window.captureError=String(error);throw error});
};
document.querySelector('#stop').onclick=()=>{window.recorder.stop();window.capture.dispose()};
</script>`;
const server = createServer((request, response) => {
  if (request.url === '/capture.js') { response.setHeader('content-type', 'text/javascript'); response.end(browserSource); }
  else { response.setHeader('content-type', 'text/html'); response.end(request.url === '/source' ? sourceHTML : captureHTML); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); assert(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({ headless: false, ignoreDefaultArgs: ['--mute-audio'], args: [
    '--auto-select-tab-capture-source-by-title=DeHub Capture Source',
    '--auto-accept-camera-and-microphone-capture', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${microphone}`, '--disable-background-timer-throttling',
  ] });
  const context = await browser.newContext({ viewport: { width: 360, height: 240 } });
  const source = await context.newPage(); await source.goto(`${origin}/source`);
  await source.getByRole('button', { name: 'Play source' }).click();
  await source.waitForFunction(() => window.sourceRunning === true);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(origin); await page.getByRole('button', { name: 'Record screen and voiceover' }).click();
  const captured = await page.evaluate(() => window.recording);
  assert.equal(captured.video, 1); assert.equal(captured.audio, 1); assert.equal(captured.originalAudio, 2);
  assert.equal(captured.settings.displaySurface, 'browser');
  await page.evaluate(() => new Promise(done => setTimeout(done, 2600)));
  await page.getByRole('button', { name: 'Save recording' }).click();
  const saved = await page.evaluate(async () => ({ bytes: [...new Uint8Array(await (await window.saved).arrayBuffer())], tracks: [...window.originalTracks, ...window.output.getTracks()].map(track => ({ kind: track.kind, state: track.readyState })) }));
  assert(saved.tracks.every(track => track.state === 'ended'), 'All real capture and mixer tracks must be released');
  assert.deepEqual(errors, []);
  const movie = resolve(directory, 'screen-and-voiceover.webm'); await writeFile(movie, Buffer.from(saved.bytes));
  const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', movie], { encoding: 'utf8' }));
  assert.equal(metadata.streams.filter(stream => stream.codec_type === 'audio').length, 1);
  assert.equal(metadata.streams.filter(stream => stream.codec_type === 'video').length, 1);
  assert(Number(metadata.format.duration) >= 2.3);
  const pixels = execFileSync('ffmpeg', ['-v', 'error', '-i', movie, '-an', '-vf', 'scale=8:8', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
  const frames = pixels.length / (8 * 8 * 3); assert(Number.isInteger(frames) && frames >= 30);
  let red = false, blue = false;
  for (let frame = 0; frame < frames; frame++) {
    const offset = frame * 8 * 8 * 3;
    red ||= pixels[offset] > pixels[offset + 2] + 100;
    blue ||= pixels[offset + 2] > pixels[offset] + 100;
  }
  assert(red && blue, 'The saved recording must contain changing source frames');
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', movie, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-']);
  const count = pcm.length / 4; assert(count >= rate * 2);
  function amplitude(frequency) {
    let real = 0, imaginary = 0;
    for (let index = 0; index < count; index++) {
      const sample = pcm.readFloatLE(index * 4); assert(Number.isFinite(sample));
      const phase = 2 * Math.PI * frequency * index / rate;
      real += sample * Math.cos(phase); imaginary += sample * Math.sin(phase);
    }
    return 2 * Math.hypot(real, imaginary) / count;
  }
  const sharedAudio = amplitude(440), voiceover = amplitude(880);
  assert(sharedAudio > .03, `Shared audio is missing from the saved recording: ${sharedAudio}`);
  assert(voiceover > .01, `Voiceover is missing from the saved recording: ${voiceover}`);
  const proof = { browser: browser.version(), sourceSha256: createHash('sha256').update(productionSource).digest('hex'), captured,
    sourceAPIReplacedWithSyntheticStreams: false, controlledMicrophoneDevice: true, physicalMicrophoneQualityVerified: false,
    savedAudioTracks: 1, savedVideoTracks: 1, duration: Number(metadata.format.duration), frames, bothSourceColorsDecoded: true,
    sharedAudioAmplitude: sharedAudio, voiceoverAmplitude: voiceover, allCaptureAndMixerTracksEnded: true };
  await writeFile(resolve(directory, 'verification.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
}
