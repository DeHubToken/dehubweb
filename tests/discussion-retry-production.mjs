import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(`${process.env.GOVERNANCE_BROWSER_ROOT}/package.json`);
const { chromium } = require('playwright');
const output = 'discussion-retry-results';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const reports = [];
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-GB' });
    await context.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
    const page = await context.newPage();
    let recover = false;
    let failures = 0;
    let recoveries = 0;
    // Only this browser's comment reads are substituted. No production writes.
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith('/rest/v1/governance_comments') && request.method() === 'GET') {
        const headers = { 'access-control-allow-origin': 'https://dehub.io' };
        if (!recover) {
          failures += 1;
          return route.fulfill({ status: 503, headers, json: { message: 'Temporary discussion outage' } });
        }
        recoveries += 1;
        return route.fulfill({ headers, json: [{
          id: '00000000-0000-4000-8000-000000000001',
          proposal_id: 'a364bebb-b4d2-412f-b1c5-f398195a055d',
          wallet_address: '0x1111111111111111111111111111111111111111',
          username: null, avatar: null, parent_id: null, updated_at: null,
          content: 'Discussion retry verification comment', created_at: '2026-10-28T00:00:00Z',
        }] });
      }
      if (url.pathname.includes('/rest/v1/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort();
      return route.continue();
    });
    try {
      await page.goto('https://dehub.io/app/governance/a364bebb-b4d2-412f-b1c5-f398195a055d', { waitUntil: 'domcontentloaded' });
      const alert = page.getByRole('alert').filter({ hasText: 'Failed to load comments' });
      await alert.waitFor({ state: 'visible', timeout: 90000 });
      await page.screenshot({ path: `${output}/${width}-error.png`, fullPage: true });
      recover = true;
      await alert.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByText('Discussion retry verification comment', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
      assert.equal(await alert.count(), 0, 'Recovered discussion must clear the error');
      assert.ok(failures > 0 && recoveries > 0, 'Retry must perform another comment read');
      await page.screenshot({ path: `${output}/${width}-recovered.png`, fullPage: true });
      reports.push({ width, failures, recoveries, result: 'passed', productionWrites: 0 });
    } finally {
      await page.screenshot({ path: `${output}/${width}-final.png`, fullPage: true }).catch(() => {});
      await context.close();
    }
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2));
  await browser.close();
}
console.log(JSON.stringify(reports, null, 2));
