import { anonymousViewerId, recordPostViews } from './post-views.ts';

const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };

Deno.test('public views use the reader token, deduplicate IDs and respect batch limits', async () => {
  const calls: { url: string; ids: number[] }[] = [];
  await recordPostViews([...Array.from({ length: 53 }, (_, index) => String(index + 1)), '1', 1, null, 'bad', '9007199254740993'], { token: 'reader-session' }, async (url, init) => {
    assert(new Headers(init?.headers).get('authorization') === 'Bearer reader-session', 'wrong viewer');
    assert(init?.method === 'POST', 'wrong method');
    calls.push({ url: String(url), ids: JSON.parse(String(init?.body)).tokenIds });
    return Response.json({ success: true, rateLimited: 1 });
  });
  assert(calls.length === 2 && calls[0].ids.length === 50 && calls[1].ids.length === 3, 'lost IDs or duplicated impressions');
  assert(calls.every(call => call.url === 'https://api.dehub.io/api/view/batch'), 'wrong public counter');
});

Deno.test('empty reads make no view request and failed writes are not reported as successful', async () => {
  await recordPostViews([], { token: 'reader-session' }, () => { throw new Error('unexpected request'); });
  for (const response of [new Response('', { status: 503 }), Response.json({ success: false })]) {
    let rejected = false;
    try { await recordPostViews(['1'], { token: 'reader-session' }, async () => response); }
    catch { rejected = true; }
    assert(rejected, 'silently dropped a public view');
  }
});

Deno.test('unsigned readers use the existing anonymous public counter with a stable private identity', async () => {
  const req = new Request('https://example.test', { headers: { 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': 'forged' } });
  const deviceId = await anonymousViewerId(req, 'test-salt');
  assert(deviceId.length === 64 && !deviceId.includes('192.0.2.1'), 'raw IP exposed');
  assert(deviceId === await anonymousViewerId(req, 'test-salt'), 'identity rotates per request');
  assert(deviceId !== await anonymousViewerId(req, 'another-salt'), 'identity is unsalted');
  await recordPostViews(['7'], { anonymousUrl: 'https://example.test/anon-views', deviceId }, async (url, init) => {
    const body = JSON.parse(String(init?.body));
    assert(String(url) === 'https://example.test/anon-views' && body.deviceId === deviceId, 'wrong anonymous route');
    assert(body.tokenIds[0] === '7' && !new Headers(init?.headers).has('authorization'), 'wrong unsigned payload');
    return Response.json({ success: true });
  });
});
