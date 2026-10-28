import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(`${process.env.PERFORMANCE_BROWSER_ROOT}/package.json`);
const { chromium } = require('playwright');
const browser = await chromium.launch();
await fs.mkdir('search-results', { recursive: true });
const results = [];
try {
  for (const phone of [false, true]) {
    const context = await browser.newContext({ viewport: phone ? { width: 393, height: 852 } : { width: 1440, height: 900 }, isMobile: phone, hasTouch: phone });
    const page = await context.newPage();
    const errors = [], requests = [];
    const result = { phone, errors, requests };
    results.push(result);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/api/search') && url.searchParams.get('q') === 'music') requests.push(Object.fromEntries(url.searchParams));
    });
    result.version = await (await context.request.get('https://dehub.io/version.json')).json();
    const firstResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/search') && url.searchParams.get('type') === 'content' && url.searchParams.get('page') === '1';
    }, { timeout: 60000 });
    await page.goto('https://dehub.io/app/explore?q=music', { waitUntil: 'domcontentloaded' });
    const response = await firstResponse;
    assert.equal(response.status(), 200);
    const first = await response.json();
    assert.ok(first.content?.items?.length > 0, 'Search must return public results');
    await page.locator('[data-explore-page]').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2000);
    assert.ok(requests.some(request => request.type === 'accounts'), 'All search must retain its people request');
    assert.ok(requests.every(request => request.type && Number(request.page) >= 1), 'No combined duplicate account search or zero-based API page');
    for (let i = 0; i < 20 && !requests.some(request => request.type === 'content' && request.page === '2'); i++) {
      await page.mouse.move(phone ? 190 : 700, phone ? 650 : 600);
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(400);
    }
    if (first.content.pagination.hasMore) assert.ok(requests.some(request => request.type === 'content' && request.page === '2'), 'Scrolling must request the second API page');
    assert.equal(errors.length, 0, 'Search raised page errors');
    await page.screenshot({ path: `search-results/${phone ? 'phone' : 'desktop'}.png` });
    result.firstPageCount = first.content.items.length;
    await context.close();
  }
} finally {
  await fs.writeFile('search-results/verification.json', JSON.stringify(results, null, 2));
  await browser.close();
}
