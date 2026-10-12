import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

assert(process.env.ISLAND_BROWSER_ROOT, 'Hosted browser dependency directory is required');
const { chromium } = await import(pathToFileURL(resolve(process.env.ISLAND_BROWSER_ROOT, 'node_modules/playwright/index.mjs')).href);
const source = stripTypeScriptTypes(await readFile('src/components/app/island-water.ts', 'utf8'));
const output = resolve('island-water-results');
await mkdir(output, { recursive: true });
const html = `<!doctype html><style>body{margin:0;background:#071624}canvas{width:100%;height:100vh;display:block}</style>
<canvas id="result"></canvas><script type="module">
import { createIslandWater } from '/water.js';
window.water = createIslandWater();
if (!window.water) throw new Error('Real water shader did not compile');
window.render = (time, night = false) => {
  const sky = document.createElement('canvas'); sky.width = 512; sky.height = 256;
  const s = sky.getContext('2d'), gradient = s.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,night?'#07081c':'#3a5896');
  gradient.addColorStop(.7,night?'#1d1444':'#e08a82');
  gradient.addColorStop(1,night?'#50276a':'#ffd39c');
  s.fillStyle=gradient;s.fillRect(0,0,512,256);
  s.fillStyle=night?'#e6d8ff':'#fff1c9';s.beginPath();s.arc(512*.69,256*.55,19,0,Math.PI*2);s.fill();
  s.fillStyle='#101d27';s.beginPath();s.moveTo(0,256);s.lineTo(0,225);s.lineTo(100,210);s.lineTo(180,256);s.fill();
  water.resize(innerWidth,innerHeight*.58); water.setSky(sky);
  window.frame={time,aspect:innerWidth/innerHeight,lightX:.69,lightHeight:.19,lightStrength:night?.55:1,
    lightColor:night?[220,200,255]:[255,240,207],waterTop:night?[26,35,88]:[47,179,181],
    waterBottom:night?[4,9,32]:[7,52,79],skyTop:night?[7,8,28]:[58,88,150]};
  const surface=water.draw(frame);if(!surface)throw new Error('Water surface unavailable');
  const canvas=document.querySelector('#result');canvas.width=innerWidth;canvas.height=innerHeight;
  const context=canvas.getContext('2d');context.drawImage(surface,0,0,canvas.width,canvas.height);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  let total=0,variation=0,opaque=true;
  for(let i=0;i<pixels.length;i+=4){total+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;opaque=opaque&&pixels[i+3]===255;
    if(i>=4)variation+=Math.abs(pixels[i]-pixels[i-4])+Math.abs(pixels[i+1]-pixels[i-3])+Math.abs(pixels[i+2]-pixels[i-2]);}
  const mean=total/(pixels.length/4);
  return {mean,variation:variation/(pixels.length/4),opaque,width:surface.width,height:surface.height,
    sample:Array.from(pixels.filter((_,index)=>index%997===0))};
};
</script>`;
const server = createServer((request, response) => {
  response.setHeader('content-type', request.url === '/water.js' ? 'text/javascript' : 'text/html');
  response.end(request.url === '/water.js' ? source : html);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = [];
try {
  for (const [width, height] of [[390, 844], [844, 390], [1440, 900], [2560, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => typeof window.render === 'function');
    const first = await page.evaluate(() => render(0));
    const second = await page.evaluate(() => render(2.5));
    assert(first.opaque, 'Sea must cover the underlying fallback');
    assert(first.mean > 5 && first.mean < 245, 'Sea must contain visible shaded pixels');
    assert(first.variation > .04, 'Wave normals must shade a spatially varied surface');
    assert.notDeepEqual(first.sample, second.sample, 'Wave motion must change the reflected surface');
    assert(first.width <= 1000 && first.height <= 640, 'Fragment work must stay bounded');
    await page.screenshot({ path: resolve(output, 'water-' + width + '.png') });
    const night = await page.evaluate(() => render(0, true));
    assert(night.mean < first.mean * .8, 'Night water must follow the dark scene palette');
    const lost = await page.evaluate(async () => {
      const surface = water.draw(frame);
      surface.getContext('webgl').getExtension('WEBGL_lose_context').loseContext();
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      return water.draw(frame) === null;
    });
    assert(lost, 'Context loss must return control to the 2D fallback');
    await page.evaluate(() => { water.dispose(); water.dispose(); });
    assert.deepEqual(errors, []);
    report.push({ width, height, mean: first.mean, night: night.mean, variation: first.variation, contextLossFallback: lost });
    await page.close();
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  server.close();
}
