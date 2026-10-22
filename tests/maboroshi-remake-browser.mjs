import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.env.REMAKE_BROWSER_ROOT, 'package.json'));
const { chromium } = require('playwright');
const root = path.resolve('services/maboroshi/static');
const ident = 'a'.repeat(32), shotId = 'b'.repeat(32), wallet = '0x' + '1'.repeat(40);
let project = { id: ident, created: 1, state: 'prepared', stage: '', status: 'Saved', renderer: 'kling', workflow: 'remake',
  seconds: 6, subject: 'product', prompt: 'Replace the product.', hasReference: true,
  references: {}, review: { approved: true, fingerprint: 'reviewed' }, files: { 'upload.mp4': '/fixture.mp4', 'seedance-input.mp4': '/fixture.mp4' }, quotes: {} };
let paymentRequests = [], saves = 0, assemblies = 0;
const server = http.createServer((request, response) => {
  const relative = new URL(request.url, 'http://localhost').pathname.replace(/^\/maboroshi\//, '').replace(/^static\//, '');
  const file = path.join(root, relative || 'index.html');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html');
  response.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.ReactNativeWebView = { postMessage(value) { window.__bridgeMessages ??= []; window.__bridgeMessages.push(JSON.parse(value)); } };
  });
  await page.route('**/maboroshi/health', route => route.fulfill({ json: { ready: true, remakeContract: 1 } }));
  await page.route('**/maboroshi/session', route => route.fulfill({ json: { wallet } }));
  await page.route('**/maboroshi/jobs', route => route.fulfill({ json: { jobs: [{ id: ident, created: 1, state: project.state, subject: 'product', workflow: 'remake' }] } }));
  await page.route(`**/maboroshi/jobs/${ident}`, route => route.fulfill({ json: project }));
  await page.route(`**/maboroshi/jobs/${ident}/remake/scan`, route => route.fulfill({ json: { cuts: [2, 4], maxShots: 8 } }));
  await page.route(`**/maboroshi/jobs/${ident}/remake/plan`, route => {
    saves++;
    assert.match(route.request().postData(), /\[2,4\]/);
    project = { ...project, state: 'editing', remake: { version: 1, fps: '24', frames: 144, building: false, shots: [
      { id: shotId, index: 0, start: 0, end: 48, versions: [shotId], seconds: 2, billableSeconds: 3, state: 'prepared', status: 'Shot ready', prompt: 'Replace the product.', priceMicros: 1190000, source: '/fixture.mp4', results: [] },
    ] } };
    return route.fulfill({ json: project });
  });
  await page.route(`**/maboroshi/jobs/${ident}/remake/revise`, route => {
    assert.match(route.request().postData(), /Make it red/);
    project.remake.shots[0] = { ...project.remake.shots[0], id: 'c'.repeat(32), state: 'prepared', prompt: 'Make it red', versions: [shotId, 'c'.repeat(32)] };
    project.state = 'editing'; return route.fulfill({ json: project });
  });
  await page.route(`**/maboroshi/jobs/${ident}/remake/assemble`, route => {
    assemblies++; project.state = 'edit_complete'; project.files['remake-result.mp4'] = '/fixture.mp4';
    return route.fulfill({ json: project });
  });
  await page.goto(`${origin}/maboroshi/?workflow=remake`);
  await page.waitForFunction(() => window.__bridgeMessages?.some(message => message.type === 'maboroshi:ready'));
  await page.evaluate(({ wallet }) => document.dispatchEvent(new CustomEvent('maboroshi:native-session', { detail: { token: 'session', wallet, allowPayments: true, paymentBridge: 1 } })), { wallet });
  await page.locator('#jobs').selectOption(ident);
  await page.locator('#remake-scan').click();
  await page.waitForFunction(() => document.getElementById('remake-cuts').value === '2, 4');
  assert.equal(await page.locator('h1').textContent(), 'Remake');
  assert.equal(await page.locator('#draft-section').isVisible(), false);
  await page.locator('#remake-plan').click();
  await page.getByRole('button', { name: 'Generate shot 1 · $1.19', exact: true }).waitFor();
  assert.equal(saves, 1);
  paymentRequests = await page.evaluate(() => window.__bridgeMessages.filter(message => message.type === 'maboroshi:pay'));
  assert.equal(paymentRequests.length, 0);
  await page.getByRole('button', { name: 'Generate shot 1 · $1.19', exact: true }).click();
  await page.waitForFunction(() => window.__bridgeMessages.some(message => message.type === 'maboroshi:pay'));
  paymentRequests = await page.evaluate(() => window.__bridgeMessages.filter(message => message.type === 'maboroshi:pay'));
  assert.equal(paymentRequests.length, 1); assert.equal(paymentRequests[0].id, shotId); assert.equal(paymentRequests[0].stage, 'draft');
  project.remake.shots[0] = { ...project.remake.shots[0], state: 'complete', results: [{ id: shotId, url: '/fixture.mp4' }] };
  await page.evaluate(requestId => document.dispatchEvent(new CustomEvent('maboroshi:native-payment-result', { detail: { requestId } })), paymentRequests[0].requestId);
  await page.getByRole('button', { name: 'Save revision · review its generation price next' }).waitFor();
  await page.getByLabel('Revise this shot').fill('Make it red');
  await page.locator('#remake-assemble').click();
  await page.locator('#remake-output').waitFor();
  assert.equal(assemblies, 1);
  assert.equal(await page.locator('#remake-output-title').textContent(), 'Your finished edit');
  // Saving a revision must preserve the completed result and must not open payment.
  await page.getByRole('button', { name: 'Save revision · review its generation price next' }).click();
  await page.getByRole('button', { name: 'Generate shot 1 · $1.19', exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.__bridgeMessages.filter(message => message.type === 'maboroshi:pay'))).length, 1);
  assert.match(await page.locator('#remake-output-title').textContent(), /Previous assembled/);
  assert.equal(await page.locator('#remake-assemble').isEnabled(), false);
  assert.deepEqual(errors, []);
  fs.mkdirSync('remake-browser-results', { recursive: true });
  await page.screenshot({ path: 'remake-browser-results/mobile-shots.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'remake-browser-results/desktop-shots.png', fullPage: true });
  console.log('Remake browser: cut review, shot payments, revisions, assembly and both viewport widths passed.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
