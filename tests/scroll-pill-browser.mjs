import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
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
function assertCut(bytes, bottom, label, rounded = false) {
  const png = PNG.sync.read(bytes);
  // Scan the full band above the cut. Green there is actual content leakage.
  for (let y = 0; y < bottom + (rounded ? 12 : 0); y++) for (let x = 12; x < png.width - 12; x++) {
    const cornerDistance = Math.min(x + 0.5 - 12, png.width - 12 - (x + 0.5));
    const cut = rounded && cornerDistance < 12
      ? bottom + 12 - Math.sqrt(144 - (12 - cornerDistance) ** 2)
      : bottom;
    // Leave the antialiased boundary pixel out of the colour assertion.
    if (y + 1 >= cut) continue;
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
            assertCut(png, theme === 'system' ? 8 : 44, `${name}/${width}/${theme}/${y}`, theme === 'system');
          }
          await page.screenshot({ path: `${output}/${name}-${width}-${theme}.png` });
        }
        if (timeline) {
          // At rest, scrolling must not mutate the inline cut or run a JS tail.
          const state = await page.evaluate(() => ({ driver: document.querySelector('#feed').dataset.feedSwallowDriver, clip: document.querySelector('#feed').style.clipPath }));
          assert.equal(state.driver, 'scroll-timeline'); assert.equal(state.clip, '');
        }
        // Follow nav hide/show transitions rather than freezing mid-motion.
        for (const transform of ['translateY(-56px)', 'translateY(0px)']) {
          await page.evaluate(transform => document.querySelector('[data-feed-nav-outer]').style.transform = transform, transform);
          for (let sample = 0; sample < 8; sample++) {
            const top = await page.locator('[data-feed-nav]').evaluate(el => el.getBoundingClientRect().top);
            if (top > 1) assertCut(await page.screenshot(), Math.floor(top) - 1, `${name}/${width}/nav-transition`);
          }
        }
        await page.waitForTimeout(350);
        // New feed data changes the scroll range without another scroll event.
        await page.evaluate(() => document.querySelector('#feed > div').style.height = '18000px');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(() => window.scrollTo(0, 14000));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assertCut(await page.screenshot(), 44, `${name}/${width}/loaded-more`);
        if (name === 'chromium') {
          await page.evaluate(() => { document.documentElement.dataset.theme = 'system'; window.scrollTo(0, 400); });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const cdp = await page.context().newCDPSession(page);
          // Page.captureScreenshot waits for the renderer's main thread.
          // Screencast frames arrive directly as the compositor paints.
          let busyFinished = false;
          const duringStall = [];
          cdp.on('Page.screencastFrame', frame => {
            void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
            if (!busyFinished && frame.metadata.scrollOffsetY > 450) duringStall.push(frame);
          });
          await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
          const busy = cdp.send('Runtime.evaluate', { expression: 'const until=performance.now()+2500;while(performance.now()<until){}' }).then(() => { busyFinished = true; });
          await new Promise(resolve => setTimeout(resolve, 100));
          const gesture = cdp.send('Input.synthesizeScrollGesture', { x: width / 2, y: 600, yDistance: -700, speed: 2000, gestureSourceType: 'mouse' });
          await new Promise(resolve => setTimeout(resolve, 1000));
          assert.equal(busyFinished, false, 'The compositor sample must occur while JavaScript is blocked');
          await busy;
          await gesture;
          await cdp.send('Page.stopScreencast');
          assert(duringStall.length > 0, 'Must capture scrolling compositor frames during the main-thread stall');
          for (const frame of duringStall) assertCut(Buffer.from(frame.data, 'base64'), 8, `blocked-main-thread/${width}`, true);
          await writeFile(`${output}/blocked-main-thread-${width}.png`, Buffer.from(duringStall.at(-1).data, 'base64'));
          await cdp.detach();
        }
        evidence.push({ browser: name, width, timeline, result: 'cutoff passed' });
        await page.close();
      }
    } finally { await browser.close(); }
  }
  if (process.env.CHECK_PRODUCTION === 'true') {
    const browser = await chromium.launch();
    try {
      for (const width of [390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        await page.goto('https://dehub.io/app', { waitUntil: 'domcontentloaded' });
        await page.locator('[data-feed-swallow-driver="scroll-timeline"]').first().waitFor({ timeout: 60000 });
        const measurements = [];
        for (const y of [300, 1800, 600, 2500, 100]) {
          await page.evaluate(y => window.scrollTo(0, y), y);
          await page.waitForTimeout(600);
          const cuts = await page.locator('[data-feed-swallow-driver="scroll-timeline"]').evaluateAll(elements => elements.map(el => {
            const clip = getComputedStyle(el).clipPath;
            const nav = Array.from(document.querySelectorAll('[data-feed-nav]')).find(n => n.getBoundingClientRect().width > 0);
            const cr = el.getBoundingClientRect(); const pr = nav?.getBoundingClientRect();
            const first = clip.match(/M 0 ([\d.-]+)/); const inset = clip.match(/inset\(([\d.-]+)px/);
            const radius = nav ? Math.min(parseFloat(getComputedStyle(nav).borderTopLeftRadius), pr.width / 2, pr.height / 2) : 0;
            return { clip, navTop: pr?.top, cutTop: first ? +first[1] + cr.top - radius : inset ? +inset[1] + cr.top : null, edge: first ? 'top' : 'bottom', navBottom: pr?.bottom };
          }));
          for (const cut of cuts) {
            assert.notEqual(cut.cutTop, null, 'Production must have an active cut');
            assert(Math.abs(cut.cutTop - (cut.edge === 'top' ? cut.navTop : cut.navBottom)) < 1.5, `Production cutoff mismatch: ${JSON.stringify(cut)}`);
          }
          measurements.push({ y, cuts });
        }
        await page.screenshot({ path: `${output}/production-${width}.png` });
        evidence.push({ browser: 'production-chromium', width, measurements });
        await page.close();
      }
    } finally { await browser.close(); }
  }
  await writeFile(`${output}/results.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally { server.close(); }
