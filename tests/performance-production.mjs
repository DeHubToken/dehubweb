import { createRequire } from 'node:module';
import fs from 'node:fs/promises';

const require = createRequire(`${process.env.PERFORMANCE_BROWSER_ROOT}/package.json`);
const { chromium } = require('playwright');
const browser = await chromium.launch();
await fs.mkdir('performance-results', { recursive: true });
const results = [];
try {
  for (const device of ['desktop', 'phone']) {
    const context = await browser.newContext({
      viewport: device === 'phone' ? { width: 393, height: 852 } : { width: 1440, height: 900 },
      isMobile: device === 'phone', hasTouch: device === 'phone',
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    if (device === 'phone') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.audit = { longTasks: [], lcp: [], shifts: [] };
      for (const [type, field] of [['longtask', 'longTasks'], ['largest-contentful-paint', 'lcp'], ['layout-shift', 'shifts']]) {
        new PerformanceObserver(list => window.audit[field].push(...list.getEntries().map(e => ({
          startTime: e.startTime, duration: e.duration, value: e.value,
          hadRecentInput: e.hadRecentInput,
        })))).observe({ type, buffered: true });
      }
      performance.setResourceTimingBufferSize(3000);
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const visit of ['cold', 'warm']) {
      const version = await (await context.request.get('https://dehub.io/version.json')).json();
      const started = Date.now();
      await page.goto('https://dehub.io/app', { waitUntil: 'domcontentloaded' });
      const author = page.getByRole('button', { name: /^View .+'s profile$/ }).first();
      await author.waitFor({ state: 'visible', timeout: 60000 });
      const feedVisibleMs = Date.now() - started;
      await page.waitForTimeout(4000);
      const load = await page.evaluate(() => ({
        navigation: performance.getEntriesByType('navigation')[0].toJSON(),
        paint: performance.getEntriesByType('paint').map(e => e.toJSON()),
        ...window.audit,
        resources: performance.getEntriesByType('resource').map(e => ({
          name: e.name.split('?')[0], startTime: e.startTime, duration: e.duration,
          transferSize: e.transferSize, decodedBodySize: e.decodedBodySize, initiatorType: e.initiatorType,
        })),
        nodes: document.querySelectorAll('*').length,
      }));
      // Sample frames while real wheel/touch gestures move the production feed.
      await page.evaluate(() => {
        window.audit.frames = [];
        window.audit.sampling = true;
        let last = performance.now();
        const frame = now => {
          window.audit.frames.push(now - last); last = now;
          if (window.audit.sampling) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const scrollStarted = await page.evaluate(() => performance.now());
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
      const timeline = [];
      cdp.on('Tracing.dataCollected', ({ value }) => timeline.push(...value));
      const categories = 'devtools.timeline,v8.execute' + (process.env.PERFORMANCE_INVALIDATIONS === '1' ? ',disabled-by-default-devtools.timeline.invalidationTracking' : '');
      await cdp.send('Tracing.start', { categories, transferMode: 'ReportEvents' });
      for (let i = 0; i < 12; i++) {
        if (device === 'phone') {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 650 }] });
          for (let step = 1; step <= 8; step++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 650 - step * 55 }] });
            await page.waitForTimeout(25);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await page.mouse.move(720, 650);
          await page.mouse.wheel(0, 550);
        }
        await page.waitForTimeout(150);
      }
      const scroll = await page.evaluate(start => {
        window.audit.sampling = false;
        const frames = window.audit.frames.slice().sort((a, b) => a - b);
        return {
          top: Math.max(window.scrollY, document.body.scrollTop, document.documentElement.scrollTop),
          p95FrameMs: frames[Math.floor(frames.length * .95)], maxFrameMs: frames.at(-1),
          framesOver50ms: frames.filter(x => x > 50).length, frames: frames.length,
          longTasks: window.audit.longTasks.filter(x => x.startTime >= start),
          nodes: document.querySelectorAll('*').length,
        };
      }, scrollStarted);
      const { profile } = await cdp.send('Profiler.stop');
      const traced = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      await traced;
      cdp.removeAllListeners('Tracing.dataCollected');
      await fs.writeFile(`performance-results/${device}-${visit}.cpuprofile`, JSON.stringify(profile));
      await fs.writeFile(`performance-results/${device}-${visit}-timeline.json`, JSON.stringify(timeline));
      await page.screenshot({ path: `performance-results/${device}-${visit}-scroll.png` });
      await page.evaluate(() => { window.scrollTo(0, 0); document.body.scrollTop = 0; });
      // A concurrent production release can announce itself over the first
      // author's button. Dismiss the notice as a reader would before navigating.
      const closeToast = page.getByRole('button', { name: 'Close toast', exact: true });
      for (const toast of await closeToast.all()) if (await toast.isVisible()) await toast.click();
      const navigationStarted = Date.now();
      await author.click();
      await page.waitForURL(url => url.pathname !== '/app');
      await page.locator('[data-swipe-back]').filter({ visible: true }).first().waitFor({ timeout: 30000 });
      const profileShellMs = Date.now() - navigationStarted;
      const backStarted = Date.now();
      await page.goBack();
      await author.waitFor({ state: 'visible' });
      const backMs = Date.now() - backStarted;
      results.push({ version, device, visit, scrollValid: scroll.top > 100, cpuSlowdown: device === 'phone' ? 4 : 1, feedVisibleMs, profileShellMs, backMs, load, scroll, errors: [...errors] });
      console.log(JSON.stringify({ device, visit, feedVisibleMs, profileShellMs, backMs, scroll }));
    }
    await context.close();
  }
} finally {
  await fs.writeFile('performance-results/results.json', JSON.stringify(results, null, 2));
  await browser.close();
}
