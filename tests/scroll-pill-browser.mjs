import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(resolve(process.env.BROWSER_DEPS, 'package.json'));
const { build } = require('esbuild');
const { chromium, webkit } = require('playwright');
const { PNG } = require('pngjs');
const output = resolve('scroll-pill-evidence');
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: ['tests/scroll-pill/fixture.tsx'], bundle: true, write: false, format: 'iife',
  nodePaths: [resolve(process.env.BROWSER_DEPS, 'node_modules')],
  alias: { '@/contexts/CachedPageActiveContext': resolve('src/contexts/CachedPageActiveContext.ts') },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const html = `<!doctype html><html data-theme="system"><style>
html,body{margin:0;background:#101010} [data-feed-nav-outer]{position:sticky;top:0;padding:8px 12px 12px;z-index:10;transition:transform .3s}
[data-feed-nav]{height:36px;border-radius:12px;background:#3338;color:white} #feed{margin:0 12px}
</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`;
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
const evidence = [];
function assertCut(bytes, bottom, label) {
  const png = PNG.sync.read(bytes);
  // Scan the full band above the cut. Green there is actual content leakage.
  for (let y = 0; y < bottom; y++) for (let x = 12; x < png.width - 12; x++) {
    const i = (y * png.width + x) * 4;
    assert(!(png.data[i + 1] > 200 && png.data[i] < 30), `${label}: content leaked at ${x},${y}`);
  }
}
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      for (const width of [390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
        await page.goto(url);
        await page.locator('#feed[data-feed-swallow-driver]').waitFor();
        const timeline = await page.evaluate(() => typeof ScrollTimeline !== 'undefined');
        for (const theme of ['system', 'hazy']) {
          await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
          for (const y of [100, 1600, 6000, 200, 4000, 0, 1800]) {
            await page.evaluate(y => window.scrollTo(0, y), y);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const png = await page.screenshot();
            assertCut(png, theme === 'system' ? 8 : 44, `${name}/${width}/${theme}/${y}`);
          }
          await page.screenshot({ path: `${output}/${name}-${width}-${theme}.png` });
        }
        if (timeline) {
          // At rest, scrolling must not mutate the inline cut or run a JS tail.
          const state = await page.evaluate(() => ({ driver: document.querySelector('#feed').dataset.feedSwallowDriver, clip: document.querySelector('#feed').style.clipPath }));
          assert.equal(state.driver, 'scroll-timeline'); assert.equal(state.clip, '');
        }
        if (name === 'chromium') {
          await page.evaluate(() => { document.documentElement.dataset.theme = 'system'; window.scrollTo(0, 400); });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const cdp = await page.context().newCDPSession(page);
          // Hold the main thread while the compositor scrolls and captures.
          const busy = cdp.send('Runtime.evaluate', { expression: 'const until=performance.now()+1500;while(performance.now()<until){}' });
          await new Promise(resolve => setTimeout(resolve, 100));
          await cdp.send('Input.synthesizeScrollGesture', { x: width / 2, y: 600, yDistance: -700, speed: 2000, gestureSourceType: 'touch' });
          const capture = await cdp.send('Page.captureScreenshot', { format: 'png' });
          const bytes = Buffer.from(capture.data, 'base64');
          assertCut(bytes, 8, `blocked-main-thread/${width}`);
          await writeFile(`${output}/blocked-main-thread-${width}.png`, bytes);
          await busy;
          await cdp.detach();
        }
        evidence.push({ browser: name, width, timeline, result: 'cutoff passed' });
        await page.close();
      }
    } finally { await browser.close(); }
  }
  await writeFile(`${output}/results.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally { server.close(); }
