import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(resolve(process.env.BROWSER_DEPS, 'package.json'));
const { build } = require('esbuild');
const { chromium, webkit } = require('playwright');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');
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
[data-feed-nav]{position:relative;height:36px;border-radius:12px;background:#3338;color:white} #feed{margin:0 12px}
html[data-theme="light"] [data-feed-nav]{border-radius:0}
</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`;
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
const evidence = [];
function assertCut(bytes, bottom, label, viewportWidth, showThrough = true) {
  const png = bytes[0] === 137 ? PNG.sync.read(bytes) : jpeg.decode(bytes, { useTArray: true });
  const scale = viewportWidth ? png.width / viewportWidth : 1;
  // Scan the full band above the cut. Green there is actual content leakage.
  for (let y = 0; y < bottom * scale; y++) for (let x = Math.ceil(12 * scale); x < png.width - 12 * scale; x++) {
    // Leave the antialiased boundary pixel out of the colour assertion.
    if ((y + 1) / scale >= bottom - 1) continue;
    const i = (y * png.width + x) * 4;
    assert(!(png.data[i + 1] > 200 && png.data[i] < 30), `${label}: content leaked at ${x},${y}`);
  }
  const visiblePixel = (Math.floor((bottom + 100) * scale) * png.width + Math.floor(png.width / 2)) * 4;
  assert(png.data[visiblePixel + 1] > 200 && png.data[visiblePixel] < 30, `${label}: feed must remain visible below the cut`);
  // Catch a regression to the old bottom-edge cut: feed must show through
  // the glass immediately below the new upper-rim cutoff.
  const glassPixel = (Math.floor((bottom + 8) * scale) * png.width + Math.floor(png.width / 2)) * 4;
  if (showThrough) assert(png.data[glassPixel + 1] > 100 && png.data[glassPixel] < 70, `${label}: feed must show through the pill below the upper-rim cut`);
}
function assertMovingCut(bytes, label) {
  const png = PNG.sync.read(bytes);
  // The red marker is pinned to the nav's top in the SAME painted frame.
  // Compare the painted nav and cutoff together rather than reading two
  // separately sampled CSS/WAAPI transforms between rendered frames.
  const x = Math.floor(png.width / 2) + 2;
  let navTop = -1;
  for (let y = 0; y < png.height; y++) {
    const i = (y * png.width + x) * 4;
    if (png.data[i] > 230 && png.data[i + 1] < 20 && png.data[i + 2] < 20) { navTop = y; break; }
  }
  if (navTop < 0) return false; // Hidden pill: its cut is outside the viewport.
  assertCut(bytes, navTop + 4, label);
  return true;
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
        for (const theme of ['light', 'minimal', 'system', 'hazy']) {
          await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
          for (const y of [100, 1600, 6000, 200, 4000, 0, 1800]) {
            await page.evaluate(y => window.scrollTo(0, y), y);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const png = await page.screenshot();
            assertCut(png, 12, `${name}/${width}/${theme}/${y}`, width, y > 0);
          }
          await page.screenshot({ path: `${output}/${name}-${width}-${theme}.png` });
        }
        if (timeline) {
          // At rest, scrolling must not mutate the inline cut or run a JS tail.
          const state = await page.evaluate(() => ({ driver: document.querySelector('#feed').dataset.feedSwallowDriver, clip: document.querySelector('#feed > [data-feed-swallow-cut]').style.clipPath }));
          assert.equal(state.driver, 'scroll-transform'); assert.notEqual(state.clip, '');
        }
        // Follow nav hide/show transitions rather than freezing mid-motion.
        for (const transform of ['translateY(calc(-100% - 3rem))', 'translateY(0px)']) {
          await page.evaluate(transform => document.querySelector('[data-feed-nav-outer]').style.transform = transform, transform);
          let visibleSamples = 0;
          for (let sample = 0; sample < 8; sample++) {
            const bytes = await page.screenshot();
            try { if (assertMovingCut(bytes, `${name}/${width}/nav-transition`)) visibleSamples++; }
            catch (error) { await writeFile(`${output}/transition-failure-${name}-${width}.png`, bytes); throw error; }
            await page.waitForTimeout(40);
          }
          if (transform === 'translateY(0px)') assert(visibleSamples > 0, 'Must check painted frames of the returning pill');
        }
        await page.waitForTimeout(350);
        // New feed data changes the scroll range without another scroll event.
        await page.evaluate(() => document.querySelector('#posts').style.height = '18000px');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(() => window.scrollTo(0, 14000));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assertCut(await page.screenshot(), 12, `${name}/${width}/loaded-more`);
        if (name === 'chromium') {
          await page.evaluate(() => { document.documentElement.dataset.theme = 'system'; window.scrollTo(0, 400); });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const cdp = await page.context().newCDPSession(page);
          // Trace screenshots are timestamped compositor frames. Start the
          // gesture before blocking JS so input hit-testing has already landed.
          const trace = [];
          cdp.on('Tracing.dataCollected', event => trace.push(...event.value));
          await cdp.send('Tracing.start', { categories: 'disabled-by-default-devtools.screenshot,devtools.timeline,blink.user_timing', transferMode: 'ReportEvents' });
          // Return the pill while JS is blocked, as on a quick upward reversal.
          await page.evaluate(() => document.querySelector('[data-feed-nav-outer]').style.transform = 'translateY(calc(-100% - 3rem))');
          await page.waitForTimeout(350);
          await page.evaluate(() => document.querySelector('[data-feed-nav-outer]').style.transform = 'translateY(0px)');
          const gesture = cdp.send('Input.synthesizeScrollGesture', { x: width / 2, y: 600, yDistance: -2000, speed: 1000, gestureSourceType: 'mouse' });
          await new Promise(resolve => setTimeout(resolve, 150));
          await cdp.send('Runtime.evaluate', { expression: "performance.mark('swallow-stall-start');const until=performance.now()+1000;while(performance.now()<until){}performance.mark('swallow-stall-end');" });
          await gesture;
          const finished = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
          await cdp.send('Tracing.end'); await finished;
          const start = trace.find(event => event.name === 'swallow-stall-start')?.ts;
          const end = trace.find(event => event.name === 'swallow-stall-end')?.ts;
          const duringStall = trace.filter(event => event.name === 'Screenshot' && event.ts > start + 300000 && event.ts < end && event.args.snapshot);
          await writeFile(`${output}/stall-trace-${width}.json`, JSON.stringify(trace));
          assert(duringStall.length > 0, 'Must capture compositor frames during the traced main-thread stall');
          for (const frame of duringStall) assertCut(Buffer.from(frame.args.snapshot, 'base64'), 12, `blocked-main-thread/${width}`, width);
          await writeFile(`${output}/blocked-main-thread-${width}.jpg`, Buffer.from(duringStall.at(-1).args.snapshot, 'base64'));
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
      for (const width of [390, 1280]) for (const theme of ['system', 'hazy']) for (const route of ['/app', '/features']) {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        await page.addInitScript(theme => localStorage.setItem('dehub.theme', theme), theme);
        await page.goto(`https://dehub.io${route}`, { waitUntil: 'domcontentloaded' });
        await page.locator('[data-feed-swallow-driver="scroll-transform"]').first().waitFor({ timeout: 60000 });
        const measurements = [];
        for (const y of [300, 1800, 600, 2500, 100]) {
          await page.evaluate(y => window.scrollTo(0, y), y);
          await page.waitForTimeout(600);
          const cuts = await page.locator('[data-feed-swallow-driver="scroll-transform"]').evaluateAll(elements => elements.map(el => {
            const clipped = el.querySelector(':scope > [data-feed-swallow-cut]') || el;
            const clip = getComputedStyle(clipped).clipPath;
            const scope = el.closest('[data-cached-page]') || document;
            const nav = Array.from(scope.querySelectorAll('[data-feed-nav], [data-feed-nav-outer] > [data-page-bento]')).find(n => n.getBoundingClientRect().width > 0);
            const cr = clipped.getBoundingClientRect(); const pr = nav?.getBoundingClientRect();
            const inset = clip.match(/inset\(([\d.-]+)px/);
            return { clip, navTop: pr?.top, cutTop: inset ? +inset[1] + cr.top : null };
          }));
          for (const cut of cuts) {
            assert.notEqual(cut.cutTop, null, 'Production must have an active cut');
            assert(Math.abs(cut.cutTop - cut.navTop - 4) < 1.5, `Production cutoff mismatch: ${JSON.stringify(cut)}`);
          }
          measurements.push({ y, cuts });
        }
        await page.screenshot({ path: `${output}/production-${route.slice(1)}-${theme}-${width}.png` });
        evidence.push({ browser: 'production-chromium', width, theme, route, measurements });
        await page.close();
      }
    } finally { await browser.close(); }
  }
  await writeFile(`${output}/results.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally { server.close(); }
