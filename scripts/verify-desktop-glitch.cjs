const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const bundle = await build({ entryPoints: ['src/components/app/navigation/desktop-wordmark-glitch.js'], bundle: true, write: false, format: 'iife', globalName: 'Glitch', nodePaths: process.env.NODE_PATH.split(path.delimiter) });
  const sources = await Promise.all(['public/dehub-header-logo.png', 'src/assets/riftn-wordmark-source.png'].map(async file => 'data:image/png;base64,' + (await fs.readFile(file)).toString('base64')));
  const sidebar = await fs.readFile('src/components/app/navigation/DesktopSidebar.tsx', 'utf8');
  assert(sidebar.includes("import('./DesktopGlitchWordmark')"));
  assert(sidebar.includes('{!renderCompactLogo ? <React.Suspense fallback={STATIC_WORDMARK}><DesktopGlitchWordmark light={isLightTheme} /></React.Suspense> : <CrumblingLogo'));
  await fs.mkdir('glitch-evidence', { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.setContent('<style>body{background:#181a20;color:white;font:14px Arial}#product{width:135px;height:45px;margin:20px}</style><canvas id="product" width="540" height="180"></canvas>');
    await page.evaluate(() => {
      let queue = new Map(), serial = 0;
      window.requestAnimationFrame = callback => { queue.set(++serial, callback); return serial; };
      window.cancelAnimationFrame = id => queue.delete(id);
      window.step = now => { const pending = queue; queue = new Map(); for (const callback of pending.values()) callback(now); };
      window.pendingFrames = () => queue.size;
      window.observers = [];
      window.IntersectionObserver = class {
        constructor(callback) { this.callback = callback; window.observers.push(this); }
        observe() { this.callback([{ isIntersecting: true }]); }
        disconnect() {}
      };
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(async sources => { window.controller = await Glitch.createDesktopGlitch(document.getElementById('product'), sources); }, sources);
    const shot = () => page.evaluate(() => document.getElementById('product').toDataURL());
    await page.evaluate(() => window.step(16));
    // 6 s loop: clean DEHUB, four pixel-rot steps, glitch into RIFTN, hold, glitch back, rebuild.
    const timing = await page.evaluate(() => [0, 1300, 1900, 2500, 3000, 3500, 4000, 5600, 5800, 5900, 6000].map(t => { const p = Glitch.phaseAt(t); return p.index ?? 'x'; }));
    assert.deepEqual(timing, [0, 2, 3, 4, 5, 'x', 1, 'x', 3, 2, 0]);
    const frames = {};
    for (const time of [0, 1300, 1900, 2500, 3000, 3450, 4000, 5600, 6000]) {
      await page.evaluate(time => window.step(time + 16), time);
      frames[time] = await shot();
      await page.screenshot({ path: `glitch-evidence/frame-${time}.png`, clip: { x: 0, y: 0, width: 220, height: 90 } });
    }
    for (const [a, b] of [[0, 1300], [1300, 1900], [1900, 2500], [2500, 3000], [3000, 3450], [3450, 4000], [0, 4000]]) assert.notEqual(frames[a], frames[b], `Frames at ${a} and ${b}ms differ`);
    assert.equal(frames[0], frames[6000], 'Loop returns to clean DEHUB');
    const atLoopStart = frames[6000];
    await page.evaluate(() => window.controller.setLight(true));
    assert.notEqual(await shot(), atLoopStart, 'Light theme uses its own dark material');
    await page.screenshot({ path: 'glitch-evidence/light-material.png' });
    await page.evaluate(() => window.controller.setLight(false));
    assert.equal(await shot(), atLoopStart, 'Changing themes preserves the animation phase');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.getElementById('product').dataset.wordmarkPhase === 'dehub');
    const reduced = await page.locator('#product').evaluate(canvas => canvas.toDataURL());
    await page.evaluate(() => window.step(40000));
    assert.equal(await page.locator('#product').evaluate(canvas => canvas.toDataURL()), reduced, 'Reduced motion stays on DEHUB');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.observers[0].callback([{ isIntersecting: false }]));
    const hidden = await page.locator('#product').evaluate(canvas => canvas.toDataURL());
    await page.evaluate(() => window.step(50000));
    assert.equal(await page.locator('#product').evaluate(canvas => canvas.toDataURL()), hidden, 'Hidden logos do not animate');
    await page.evaluate(() => window.controller.dispose());
    await page.evaluate(() => window.step(60000));
    assert.deepEqual(errors, []);
    await fs.writeFile('glitch-evidence/result.json', JSON.stringify({ passed: true, checks: ['six-second loop', 'four pixel-rot steps', 'glitch into RIFTN', 'RIFTN hold', 'rebuild', 'light theme', 'reduced motion', 'hidden suspension', 'dispose'], errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
