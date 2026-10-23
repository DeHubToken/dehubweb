import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const require = createRequire(`${process.env.GOVERNANCE_BROWSER_ROOT}/package.json`);
const { chromium } = require('playwright');
const output = 'governance-results';
await mkdir(output, { recursive: true });
const source = await readFile('src/integrations/supabase/client.ts', 'utf8');
const anonKey = source.match(/"(eyJ[^"\s]+)"/)?.[1];
assert.ok(anonKey, 'Public Supabase key must be available');
const wallet = '0x1111111111111111111111111111111111111111';
const token = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.invalid-production-test`;
const report = { backend: [], toast: null };

// An invalid proposal prevents persistence even if the guard is missing.
for (const base of ['https://aigxuutjaqsywioxjefr.supabase.co', 'https://dehub.io/_sb']) {
  const response = await fetch(`${base}/rest/v1/governance_comments`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json', 'x-wallet-address': wallet, 'x-dehub-token': token },
    body: JSON.stringify({ proposal_id: '00000000-0000-0000-0000-000000000000', wallet_address: wallet, content: 'governance-guard-verification' }),
  });
  const result = await response.json();
  assert.ok([401, 403].includes(response.status), `${base}: spoofed session must be rejected`);
  assert.equal(result.message, 'Authentication required');
  report.backend.push({ base, status: response.status, message: result.message });
}

// Exercise the shipped UI's rejection handling without a real account or write.
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB' });
const user = { address: wallet, walletAddress: wallet, username: 'governance_check', displayName: 'Governance verification', badgeBalance: 0, ownBadgeBalance: 0, badgeLock: null };
await context.addInitScript(({ wallet, token, user }) => {
  localStorage.setItem('dehub_wallet', wallet);
  localStorage.setItem('dehub_token', token);
  localStorage.setItem('dehub_user', JSON.stringify(user));
  localStorage.setItem('i18nextLng', 'en');
}, { wallet, token, user });
let refusedWrites = 0;
const page = await context.newPage();
const cors = { 'access-control-allow-origin': 'https://dehub.io', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
await page.route('**/*', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const api = url.hostname === 'api.dehub.io' || url.pathname.startsWith('/_api/');
  if (api) {
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': request.headers()['access-control-request-headers'] || '*' } });
    if (url.pathname.includes('/account_info/')) return route.fulfill({ headers: cors, json: { result: user } });
    return route.fulfill({ headers: cors, json: { status: true, result: [], count: 0, unreadCount: 0 } });
  }
  if (url.pathname.endsWith('/rest/v1/governance_comments') && request.method() === 'POST') {
    assert.equal(request.headers()['x-dehub-token'], token, 'Comment must carry the refreshed session');
    assert.equal(request.postDataJSON().wallet_address, wallet);
    refusedWrites += 1;
    return route.fulfill({ status: 401, headers: cors, json: { code: '42501', message: 'Badge holders only', details: null, hint: null } });
  }
  if (url.pathname.includes('/rest/v1/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.abort();
  return route.continue();
});
try {
  await page.goto('https://dehub.io/app/governance/a364bebb-b4d2-412f-b1c5-f398195a055d', { waitUntil: 'domcontentloaded' });
  const composer = page.getByPlaceholder('Add a comment...', { exact: true });
  await composer.waitFor({ state: 'visible', timeout: 90000 });
  await composer.fill('governance-toast-verification');
  await page.locator('form').filter({ has: composer }).locator('button[type="submit"]').click();
  await page.getByText('Badge holders only', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(refusedWrites, 1);
  assert.equal(await composer.inputValue(), 'governance-toast-verification', 'A rejected draft must remain');
  await page.screenshot({ path: `${output}/badge-holders-only.png`, fullPage: true });
  report.toast = 'Exact toast rendered by production bundle after an isolated simulated backend denial; draft retained; no comment saved';
} finally {
  await page.screenshot({ path: `${output}/final-state.png`, fullPage: true }).catch(() => {});
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
