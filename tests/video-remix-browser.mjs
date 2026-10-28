import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildRemixStudioHtml } from '../src/lib/editor/remixStudioHtml.ts';

const browserRoot = process.env.REMIX_BROWSER_ROOT;
assert(browserRoot, 'REMIX_BROWSER_ROOT must point at the hosted browser dependencies');
const requireBrowser = createRequire(path.join(browserRoot, 'package.json'));
const { chromium } = requireBrowser('playwright');
const output = path.resolve('video-remix-browser-results');
await mkdir(output, { recursive: true });
const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const sourcePath = path.join(output, 'source.mp4');
const cameraPath = path.join(output, 'camera.y4m');
const microphonePath = path.join(output, 'microphone.wav');
ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x174b91:s=720x1280:r=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '6', '-vf', 'drawbox=x=100:y=150:w=120:h=120:color=yellow:t=fill', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', sourcePath]);
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x480:rate=24', '-t', '3', '-pix_fmt', 'yuv420p', cameraPath]);
ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '6', '-ac', '1', microphonePath]);
// A phone clip picked from the library for a stitch reply.
const replyPath = path.join(output, 'reply.mp4');
ffmpeg(['-f', 'lavfi', '-i', 'color=c=0xb3263b:s=720x1280:r=24', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', replyPath]);
const source = await readFile(sourcePath);
const browser = await chromium.launch({ headless: true, args: [
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-video-capture=${cameraPath}`, `--use-file-for-fake-audio-capture=${microphonePath}`,
  '--autoplay-policy=no-user-gesture-required',
] });
const results = [];
try {
  for (const variant of ['collab', 'sound', 'stitch', 'stitch-upload', 'green-screen']) {
    const mode = variant === 'stitch-upload' ? 'stitch' : variant;
    const context = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 430, height: 900 } });
    const page = await context.newPage();
    const logs = [], errors = [], requests = [];
    page.on('console', message => logs.push(`${message.type()}: ${message.text()}`));
    page.on('pageerror', error => errors.push(String(error)));
    page.on('requestfailed', request => logs.push(`request failed: ${request.url()} ${request.failure()?.errorText}`));
    page.on('response', response => { if (/mediapipe|\.tflite/.test(response.url())) requests.push({ url: response.url(), status: response.status() }); });
    const key = `recording-test-${variant}`;
    await page.addInitScript(() => {
      window.remixPackets = [];
      window.addEventListener('message', event => { if (event.data?.type) window.remixPackets.push(event.data); });
    });
    await page.route('https://media.remix.test/source.mp4', route => route.fulfill({ status: 200, contentType: 'video/mp4', headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, body: source }));
    await page.route('https://remix.test/', route => route.fulfill({ status: 200, contentType: 'text/html', body: buildRemixStudioHtml({ mode, videoUrl: 'https://media.remix.test/source.mp4', sourceUrl: 'https://dehub.io/app/post/fixture', title: 'Recording fixture', creator: 'fixture', bridgeKey: key }) }));
    try {
      await page.goto('https://remix.test/');
      await page.waitForFunction(() => window.remixPackets.some(packet => packet.type === 'ready'), undefined, { timeout: 30000 });
      await page.locator('#countdown').uncheck();
      if (mode === 'stitch') {
        // Drag the trim box to the middle, then shrink it to one second by its edge.
        const track = await page.locator('#track').boundingBox();
        await page.mouse.move(track.x + track.width * 0.3, track.y + track.height / 2);
        await page.mouse.down();
        await page.mouse.move(track.x + track.width * 0.5, track.y + track.height / 2, { steps: 4 });
        await page.mouse.up();
        assert(Number(await page.locator('#trim').inputValue()) > 0.5, 'dragging the box moves the stitch start');
        await page.locator('#cutLength').evaluate(input => { input.value = '1'; input.dispatchEvent(new Event('input')); });
        assert.equal(await page.locator('#cutValue').textContent(), '1.0s');
      }
      if (mode === 'green-screen') await page.locator('#layout').selectOption('square');
      if (variant === 'stitch-upload') {
        await page.locator('#upload').setInputFiles(replyPath);
        await page.locator('#status').filter({ hasText: 'Clip ready' }).waitFor({ timeout: 20000 });
      } else {
        await page.locator('#camera').click();
        await page.locator('#status').filter({ hasText: 'Ready. Use headphones' }).waitFor({ timeout: 120000 });
      }
      await page.waitForFunction(() => !document.querySelector('#record').disabled, undefined, { timeout: 15000 });
      await page.screenshot({ path: path.join(output, `${variant}-preview.png`) });
      await page.locator('#record').click();
      if (variant === 'stitch-upload') {
        // One second of source plus the two-second clip, then it stops by itself.
        await page.locator('#use').waitFor({ state: 'visible', timeout: 20000 });
      } else {
        await page.waitForFunction(() => Number.parseFloat(document.querySelector('#clock').textContent) >= 2, undefined, { timeout: 20000 });
        await page.locator('#stop').click();
      }
      await page.locator('#use').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('#use').click();
      await page.waitForFunction(() => window.remixPackets.some(packet => packet.type === 'recorded'), undefined, { timeout: 15000 });
      const packet = await page.evaluate(() => window.remixPackets.find(value => value.type === 'recorded'));
      assert.equal(packet.key, key);
      assert.equal(packet.width, 720);
      assert.equal(packet.height, mode === 'green-screen' ? 720 : 1280);
      assert(packet.duration >= 1.8 && packet.duration <= 5, `${variant}: unexpected recording length ${packet.duration}`);
      if (variant === 'stitch-upload') assert(packet.duration >= 2.7 && packet.duration <= 3.4, `stitched clip should be 1s + 2s, got ${packet.duration}`);
      const match = /^data:(video\/(?:webm|mp4));base64,([A-Za-z0-9+/]+=*)$/.exec(packet.dataUrl);
      assert(match, `${mode}: normalized video data URL is required`);
      const bytes = Buffer.from(match[2], 'base64');
      assert(bytes.length > 1000 && bytes.length <= 24 * 1024 * 1024);
      const file = path.join(output, `${variant}.${match[1] === 'video/mp4' ? 'mp4' : 'webm'}`);
      await writeFile(file, bytes);
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
      const video = probe.streams.find(stream => stream.codec_type === 'video');
      const audio = probe.streams.find(stream => stream.codec_type === 'audio');
      assert(video && ['vp8', 'vp9', 'h264'].includes(video.codec_name), `${mode}: decodable video stream`);
      assert.equal(video.width, packet.width);
      assert.equal(video.height, packet.height);
      assert(audio && ['opus', 'aac'].includes(audio.codec_name), `${mode}: mixed audio stream`);
      // MediaRecorder WebM may omit container duration; count decoded frames instead.
      const frames = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json', file], { encoding: 'utf8' }));
      assert(Number(frames.streams[0]?.nb_read_frames) >= 12, `${mode}: recording must contain moving frames`);
      ffmpeg(['-i', file, '-ss', '0.5', '-frames:v', '1', path.join(output, `${variant}-recorded.png`)]);
      if (mode === 'stitch') {
        // The first second is the source (blue), the rest is the reply.
        const pixel = at => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'crop=1:1:600:1100,format=rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1024 });
        const [r0, , b0] = pixel(0.4);
        assert(b0 > 100 && r0 < 80, `${variant}: stitched part shows the source first (rgb ${[...pixel(0.4)]})`);
        if (variant === 'stitch-upload') {
          const [r1, , b1] = pixel(2);
          assert(r1 > 120 && b1 < 100, `stitch-upload: the uploaded clip follows the source (rgb ${[...pixel(2)]})`);
        }
      }
      const frameTimes = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', file], { encoding: 'utf8' }));
      const lastTimestamp = Number(frameTimes.frames.at(-1)?.best_effort_timestamp_time);
      assert(lastTimestamp >= 1.5 && Math.abs(lastTimestamp - packet.duration) < 0.75, `${variant}: decoded duration ${lastTimestamp} must match reported duration ${packet.duration}`);
      if (mode === 'green-screen') {
        assert(requests.some(request => request.url.includes('@mediapipe/tasks-vision@0.10.21/') && request.status === 200), 'Pinned real MediaPipe runtime must load');
        assert(requests.some(request => request.url.endsWith('selfie_segmenter.tflite') && request.status === 200), 'Real selfie model must load');
      }
      await page.evaluate(key => window.postMessage({ key, type: 'save-failed', error: 'Test retry' }, '*'), key);
      await page.waitForFunction(() => !document.querySelector('#use').disabled);
      await page.locator('#use').click();
      await page.waitForFunction(() => window.remixPackets.filter(packet => packet.type === 'recorded').length === 2);
      assert.equal(errors.length, 0, errors.join('\n'));
      assert.deepEqual(await page.evaluate(() => window.remixPackets.filter(packet => packet.type === 'error').map(packet => packet.error)), []);
      await page.evaluate(key => window.postMessage({ key, type: 'dispose' }, '*'), key);
      await page.waitForFunction(() => [...(document.querySelector('#cameraVideo').srcObject?.getTracks() || [])].every(track => track.readyState === 'ended'));
      results.push({ mode: variant, bytes: bytes.length, width: video.width, height: video.height, duration: packet.duration, decodedDuration: lastTimestamp, videoCodec: video.codec_name, audioCodec: audio.codec_name, modelRequests: requests });
    } catch (error) {
      await page.screenshot({ path: path.join(output, `${variant}-failure.png`) }).catch(() => {});
      await writeFile(path.join(output, `${variant}-failure.txt`), `${error.stack}\n${await page.locator('body').innerText().catch(() => '')}\n${logs.join('\n')}\n${errors.join('\n')}`);
      throw error;
    } finally {
      await writeFile(path.join(output, `${variant}-console.txt`), logs.join('\n'));
      await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
      await context.close();
    }
  }
} finally { await browser.close(); }
console.log(JSON.stringify(results, null, 2));
