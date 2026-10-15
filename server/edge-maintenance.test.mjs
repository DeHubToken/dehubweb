import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { edgeMaintenanceResponse } from './edge-maintenance.mjs';

const page = readFileSync(new URL('../public/maintenance-edge.html', import.meta.url), 'utf8');
const env = { MAINTENANCE_MODE: 'true', ASSETS: { fetch: async request => {
  assert.equal(new URL(request.url).pathname, '/maintenance-edge.html');
  return new Response(page, { headers: { 'Content-Type': 'text/html' } });
} } };

test('maintenance is opt-in and limited to the production website', async () => {
  assert.equal(await edgeMaintenanceResponse(new Request('https://dehub.io/'), { ...env, MAINTENANCE_MODE: 'false' }), null);
  assert.equal(await edgeMaintenanceResponse(new Request('https://api.dehub.io/'), env), null);
});
test('root and deep links serve the local page with temporary outage headers', async () => {
  for (const path of ['/', '/app', '/posts/123', '/maintenance']) {
    const response = await edgeMaintenanceResponse(new Request('https://dehub.io' + path), env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '120');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    const html = await response.text();
    assert.ok(html.includes('A little work.<br>A better DeHub.'));
    assert.ok(html.includes('border-radius:12px'));
    assert.ok(!html.includes('/assets/'));
  }
});
test('native status is available independently of the failed server', async () => {
  const response = await edgeMaintenanceResponse(new Request('https://dehub.io/maintenance.json'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: true });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});
test('API writes return maintenance JSON rather than HTML or an origin request', async () => {
  const response = await edgeMaintenanceResponse(new Request('https://dehub.io/_api/api/post', { method: 'POST', body: 'test' }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'MAINTENANCE');
});
test('HEAD is empty and local artwork, app links and deployment receipts remain available', async () => {
  const response = await edgeMaintenanceResponse(new Request('https://dehub.io/', { method: 'HEAD' }), env);
  assert.equal(response.status, 503);
  assert.equal(await response.text(), '');
  for (const path of ['/brand-kit/icons/clock.png', '/version.json', '/.well-known/assetlinks.json']) {
    assert.equal(await edgeMaintenanceResponse(new Request('https://dehub.io' + path), env), null);
  }
});
