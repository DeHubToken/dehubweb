import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probe } from '../lib/probe.mjs';
import { GET } from '../api/health.mjs';

test('local health never contacts an upstream and cannot be cached', async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await response.json()).service, 'dehub-edge-canary');
});
test('API probe uses only a fixed public GET with bounded timeout', async () => {
  const response = await probe('api', async (url, options) => {
    assert.equal(url, 'https://api.dehub.io/api/health');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ status: 'ok' });
  });
  assert.equal(response.status, 200);
});
test('web probe requires the staging application shell', async () => {
  const fetcher = async url => {
    assert.equal(url, 'https://staging.dehub.io/app');
    return new Response('<div id="root"></div>', { headers: { 'Content-Type': 'text/html' } });
  };
  assert.equal((await probe('web', fetcher)).status, 200);
  assert.equal((await probe('web', async () => new Response('challenge'))).status, 502);
});
test('unknown destinations cannot become an open proxy', async () => {
  assert.equal((await probe('https://example.com', () => assert.fail('must not fetch'))).status, 404);
});
test('upstream errors and malformed JSON are failures without leaking details', async () => {
  const response = await probe('api', async () => { throw new Error('private diagnostic'); });
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('private diagnostic'), false);
  assert.equal((await probe('api', async () => new Response('not JSON'))).status, 502);
  assert.equal((await probe('api', async () => new Response('', { status: 503 }))).status, 502);
});
