import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(`${process.env.SWIPE_BROWSER_ROOT}/package.json`);
const { chromium } = require('playwright');
await fs.mkdir('swipe-back-results', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const session = await context.newCDPSession(page);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function swipe(x = 12, y = 240, dx = 120, dy = 4) {
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 6; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
try {
  await page.goto('https://dehub.io/app', { waitUntil: 'domcontentloaded' });
  const creator = page.getByRole('button', { name: /^View .+'s profile$/ }).first();
  await creator.waitFor({ state: 'visible', timeout: 45000 });
  const label = await creator.getAttribute('aria-label');
  const feedUrl = page.url();
  const feedScroll = await page.evaluate(() => window.scrollY);
  await creator.click();
  await page.waitForURL(url => url.href !== feedUrl);
  const profileUrl = page.url();
  await page.locator('[data-swipe-back]').filter({ visible: true }).first().waitFor();
  await swipe(180, 240, 100, 2);
  assert.equal(page.url(), profileUrl, 'A center-screen swipe navigated back');
  await page.screenshot({ path: 'swipe-back-results/profile.png' });
  await swipe();
  await page.waitForURL(feedUrl);
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - feedScroll) < 40, 'Feed scroll was lost');
  await page.getByRole('button', { name: label, exact: true }).first().waitFor({ state: 'visible' });
  await page.screenshot({ path: 'swipe-back-results/feed-restored.png' });
  // A cold profile URL has no previous app entry. Its existing back control
  // must take the same home fallback when swiped.
  const cold = await context.newPage();
  await cold.goto(profileUrl, { waitUntil: 'domcontentloaded' });
  await cold.locator('[data-swipe-back]').filter({ visible: true }).first().waitFor({ timeout: 45000 });
  const coldSession = await context.newCDPSession(cold);
  await coldSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 12, y: 240 }] });
  await coldSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 110, y: 244 }] });
  await coldSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cold.waitForURL('https://dehub.io/app');
  assert.equal(errors.length, 0, `Page errors: ${errors.join('; ')}`);
  await fs.writeFile('swipe-back-results/result.json', JSON.stringify({ passed: true, feedUrl, profileUrl, label, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: 'swipe-back-results/failure.png' }).catch(() => {});
  await fs.writeFile('swipe-back-results/result.json', JSON.stringify({ passed: false, message: error.message, url: page.url(), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
