const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const bundle = await build({ entryPoints: ['src/components/app/navigation/desktop-wordmark-fracture.js'], bundle: true, write: false, format: 'iife', globalName: 'WordmarkRenderer', nodePaths: process.env.NODE_PATH.split(path.delimiter) });
  const image = 'data:image/png;base64,' + (await fs.readFile('public/dehub-header-logo.png')).toString('base64');
  await fs.mkdir('wordmark-evidence', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 550 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setContent('<style>body{margin:0;background:#070b11;color:#ddd;font:16px system-ui}button{display:block;width:980px;padding:0;border:0;background:radial-gradient(ellipse at center,#17212c,#020304)}canvas{display:block;width:100%;aspect-ratio:350/177.2}</style><button aria-label="Reassemble"><canvas></canvas></button>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(async image => {
      const canvas = document.querySelector('canvas');
      window.wordmark = await WordmarkRenderer.createDesktopWordmark(canvas, image, { stage: .6 });
      const button = document.querySelector('button');
      button.addEventListener('pointerenter', () => window.wordmark.setHovered(true));
      button.addEventListener('pointerleave', () => window.wordmark.setHovered(false));
      button.addEventListener('focus', () => window.wordmark.setHovered(true));
      button.addEventListener('blur', () => window.wordmark.setHovered(false));
    }, image);
    const progress = () => page.locator('canvas').getAttribute('data-fracture-progress').then(Number);
    await page.waitForTimeout(1000);
    assert.equal(await progress(), 0, 'The first two seconds must stay intact');
    await page.screenshot({ path: 'wordmark-evidence/day-0.png' });
    await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.fractureProgress) > .59);
    await page.getByRole('button', { name: 'Reassemble' }).hover();
    await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.fractureProgress) === 0);
    await page.screenshot({ path: 'wordmark-evidence/hover-intact.png' });
    await page.mouse.move(999, 549);
    await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.fractureProgress) > .59);
    await page.getByRole('button').focus();
    await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.fractureProgress) === 0);
    await page.getByRole('button').evaluate(button => button.blur());
    for (let day = 1; day <= 5; day++) {
      await page.evaluate(day => window.wordmark.setStage(day / 5), day);
      await page.waitForFunction(day => Math.abs(Number(document.querySelector('canvas').dataset.fractureProgress) - day / 5) < .0001, day);
      await page.screenshot({ path: `wordmark-evidence/day-${day}.png` });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.wordmark.setHovered(true));
    assert.equal(await progress(), 0, 'Reduced motion reassembles without tweening');
    await page.evaluate(() => window.wordmark.dispose());
    assert.deepEqual(errors, []);
    await fs.writeFile('wordmark-evidence/result.json', JSON.stringify({ passed: true, checks: ['two-second hold', 'day progress', 'hover restore', 'pointer leave', 'keyboard restore', 'reduced motion', 'dispose'], errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
