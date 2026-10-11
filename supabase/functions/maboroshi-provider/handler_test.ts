import { createHandler, media, queueUrl } from './handler.ts';

const secret = 'internal-test-credential-32-characters';
const values: Record<string, string> = {INTERNAL_SERVICE_SECRET: secret, FAL_KEY: 'private-fal', REPLICATE_API_KEY: 'private-replicate'};
const env = (name: string) => values[name];
const signed = `https://live.dehub.io/maboroshi/media/${'a'.repeat(32)}/seedance-input.mp4?expires=1999999999&signature=${'b'.repeat(64)}`;
const req = (body: unknown, credential = secret) => new Request('https://example.org', {method: 'POST', headers: {'x-internal-secret': credential}, body: JSON.stringify(body)});
function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }

Deno.test('anonymous and wallet callers cannot access shared credentials or start processing', async () => {
  let calls = 0;
  const handler = createHandler(env, (() => { calls++; throw new Error(); }) as typeof fetch);
  for (const token of ['', 'wallet-token']) assert((await handler(req({operation: 'draft'}, token))).status === 401);
  const health = await handler(req({operation: 'health'}));
  assert(await health.text() === '{"ready":true}');
  assert(calls === 0);
});

Deno.test('untrusted media and arbitrary queue URLs cannot receive credentials', () => {
  assert(media(signed) === signed);
  for (const url of ['http://127.0.0.1/private', signed.replace('live.dehub.io', 'example.org'), signed.replace('/media/', '/setup/')]) {
    let rejected = false; try { media(url); } catch { rejected = true; } assert(rejected);
  }
  for (const url of ['https://example.org/status', 'https://queue.fal.run/other/model/requests/id/status', 'https://queue.fal.run/bytedance/seedance-2.5/requests/wrong/status']) {
    let rejected = false; try { queueUrl(url, 'id', 'status'); } catch { rejected = true; } assert(rejected);
  }
});

Deno.test('draft forces shared-account preview and HD uses returned draft ID', async () => {
  const sent: Array<{url: string; body: any}> = [];
  const handler = createHandler(env, (async (url, options) => {
    assert(new Headers(options?.headers).get('Authorization') === 'Key private-fal');
    sent.push({url: String(url), body: JSON.parse(String(options?.body))});
    return Response.json({request_id: 'queue-id', status_url: 'https://queue.fal.run/bytedance/seedance-2.5/requests/queue-id/status', response_url: 'https://queue.fal.run/bytedance/seedance-2.5/requests/queue-id'});
  }) as typeof fetch);
  assert((await handler(req({operation: 'draft', input: {prompt: 'Replace subject', task: 'editing', video_urls: [signed], image_urls: [signed], duration: 'auto', draft: false, resolution: '1080p'}}))).status === 200);
  assert(sent[0].body.draft === true && sent[0].body.resolution === '480p');
  assert((await handler(req({operation: 'hd', draft_id: 'completed-draft-id'}))).status === 200);
  assert(sent[1].url.endsWith('/draft/complete'));
  assert(sent[1].body.draft_id === 'completed-draft-id' && sent[1].body.resolution === '1080p');
});

Deno.test('provider failure never exposes credentials or payload', async () => {
  const handler = createHandler(env, (async () => new Response('private-fal private signed URL', {status: 403})) as typeof fetch);
  const response = await handler(req({operation: 'hd', draft_id: 'id'}));
  assert(response.status === 502);
  assert(! (await response.text()).includes('private'));
});
