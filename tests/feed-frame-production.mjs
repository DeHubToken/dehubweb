import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(`${process.env.PERFORMANCE_BROWSER_ROOT}/package.json`);
const { chromium } = require('playwright');
const browser = await chromium.launch();
await fs.mkdir('performance-results', { recursive: true });
const results = [];
try {
  for (const phone of [false, true]) {
    const context = await browser.newContext({ viewport: phone ? { width: 393, height: 852 } : { width: 1440, height: 900 }, isMobile: phone, hasTouch: phone });
    const page = await context.newPage();
    // A cold, delayed bitmap must keep the same frame as its placeholder.
    await page.route(/\/(?:cdn-cgi\/image|images|feed-images)\//, async route => {
      await new Promise(resolve => setTimeout(resolve, 900));
      await route.continue().catch(() => {});
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.frameAudit = { shifts: [], seen: [], inspected: 0 };
      const items = new Map();
      const old = new Map();
      const visibility = new IntersectionObserver(entries => {
        for (const e of entries) {
          const state = items.get(e.target);
          if (state) state.visible = e.isIntersecting;
        }
      }, { rootMargin: '0px 10000px' });
      const sizes = new ResizeObserver(entries => {
        for (const entry of entries) {
          const state = items.get(entry.target);
          if (!state) continue;
          const { width, height } = entry.contentRect;
          if (width < 1 || height < 1) continue;
          const previous = state.size;
          const returning = old.get(state.key);
          const differs = size => size && (Math.abs(size.width - width) > 3 || Math.abs(size.height - height) > 3);
          if (state.visible && differs(previous)) window.frameAudit.shifts.push({ key: state.key, previous, next: { width, height } });
          if (!previous && differs(returning)) window.frameAudit.shifts.push({ key: state.key, remount: true, previous: returning, next: { width, height } });
          state.size = { width, height };
          old.set(state.key, state.size);
        }
      });
      const scan = node => {
        if (!(node instanceof Element)) return;
        const frames = [...node.querySelectorAll('[data-media-frame-key]')];
        if (node.matches('[data-media-frame-key]')) frames.push(node);
        for (const el of frames) {
          if (items.has(el)) continue;
          const key = el.getAttribute('data-media-frame-key');
          items.set(el, { key, visible: false });
          if (!window.frameAudit.seen.includes(key)) window.frameAudit.seen.push(key);
          window.frameAudit.inspected++;
          visibility.observe(el); sizes.observe(el);
        }
      };
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) scan(node);
        for (const [node] of items) if (!node.isConnected) {
          visibility.unobserve(node); sizes.unobserve(node); items.delete(node);
        }
      }).observe(document, { childList: true, subtree: true });
    });
    const version = await (await context.request.get('https://dehub.io/version.json')).json();
    await page.goto('https://dehub.io/app', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^View .+'s profile$/ }).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(2500);
    const cdp = await context.newCDPSession(page);
    for (const direction of [1, -1]) for (let i = 0; i < 22; i++) {
      if (phone) {
        const from = direction > 0 ? 650 : 200;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: from }] });
        for (let step = 1; step <= 8; step++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: from - direction * step * 50 }] });
          await page.waitForTimeout(25);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(700, 600);
        await page.mouse.wheel(0, direction * 500);
      }
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(2000);
    const audit = await page.evaluate(() => window.frameAudit);
    const result = { phone, version, ...audit, errors };
    results.push(result);
    console.log(JSON.stringify(result));
    await page.screenshot({ path: `performance-results/frames-${phone ? 'phone' : 'desktop'}.png` });
    assert.ok(audit.seen.length >= 5, 'The audit did not exercise enough media frames');
    assert.equal(audit.shifts.length, 0, 'Visible or returning media frames resized');
    assert.equal(errors.length, 0, 'Production raised page errors');
    const scrims = await page.evaluate(() => {
      document.documentElement.dataset.theme = 'system';
      document.documentElement.dataset.systemTone = 'light';
      const oldScope = ':has(> .absolute.inset-0:is([class*="bg-gradient-to-t"], [class*="bg-gradient-to-b"])[class*="from-black"])';
      return {
        unmarked: document.querySelectorAll(`${oldScope}:not([data-media-scrim])`).length,
        colours: Array.from(document.querySelectorAll('[data-media-scrim] .text-white'), el => getComputedStyle(el).color),
      };
    });
    assert.equal(scrims.unmarked, 0, 'A picture scrim is missing its explicit colour scope');
    assert.ok(scrims.colours.length > 0, 'The light-theme check did not exercise overlay text');
    assert.ok(scrims.colours.every(colour => colour === 'rgb(255, 255, 255)'), 'Picture overlay text lost white contrast in System Light');
    await page.screenshot({ path: `performance-results/scrims-light-${phone ? 'phone' : 'desktop'}.png` });
    await context.close();
  }
} finally {
  await fs.writeFile('performance-results/frames.json', JSON.stringify(results, null, 2));
  await browser.close();
}
