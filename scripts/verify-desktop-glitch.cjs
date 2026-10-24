const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const bundle = await build({ entryPoints: ['src/components/app/navigation/desktop-wordmark-glitch.js'], bundle: true, write: false, format: 'iife', globalName: 'Glitch', nodePaths: process.env.NODE_PATH.split(path.delimiter) });
  const sources = await Promise.all(['public/dehub-header-logo.png', 'src/assets/riftn-wordmark-source.png'].map(async file => 'data:image/png;base64,' + (await fs.readFile(file)).toString('base64')));
  const preview = await fs.readFile('tests/fixtures/desktop-logo-glitch-preview.html', 'utf8');
  for (const src of sources) assert(preview.includes(src), 'Use the same source assets as the approved preview');
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
    await page.evaluate(markup => {
      const container = document.createElement('div');
      container.innerHTML = markup.replace(/<script>[\s\S]*?<\/script>/, ''); document.body.append(container);
    }, preview);
    await page.addScriptTag({ content: preview.match(/<script>([\s\S]*?)<\/script>/)[1] });
    await page.waitForFunction(() => window.pendingFrames() === 2);
    const compare = async () => page.evaluate(() => document.getElementById('product').toDataURL() === document.querySelector('.header-logo').toDataURL());
    assert(await compare(), 'Initial wordmark must match the approved preview pixel for pixel');
    await page.evaluate(() => window.step(16));
    for (const time of [0, 2800, 3000, 7300, 7500, 9999, 10000, 10080, 10140, 10259, 10260, 10660, 11000, 11620, 12259, 12260, 12400, 12520, 15320]) {
      await page.evaluate(time => window.step(time + 16), time);
      assert(await compare(), `Preview pixel parity at ${time}ms`);
      if ([0, 2800, 10140, 10660, 11000, 12520].includes(time)) await page.screenshot({ path: `glitch-evidence/frame-${time}.png` });
    }
    const timing = await page.evaluate(() => [Glitch.phaseAt(9999).index, Glitch.phaseAt(10260).index, Glitch.phaseAt(12259).index, Glitch.phaseAt(12520).index]);
    assert.deepEqual(timing, [0, 1, 1, 0]);
    await page.evaluate(() => window.controller.setLight(true));
    assert(!await compare(), 'Light theme uses its own dark material');
    await page.screenshot({ path: 'glitch-evidence/light-material.png' });
    await page.evaluate(() => window.controller.setLight(false));
    assert(await compare(), 'Changing themes preserves the animation phase');
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
    await fs.writeFile('glitch-evidence/result.json', JSON.stringify({ passed: true, checks: ['exact preview canvas pixels', 'ten-second DEHUB hold', 'two-second RIFTN hold', 'both flickers', 'both transitions', 'light theme', 'reduced motion', 'hidden suspension', 'dispose'], errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
