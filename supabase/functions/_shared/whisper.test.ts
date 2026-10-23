import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchWhisper, fromWhisper, resolveWhisperConfig, secretMatches, WHISPER_START_WITHIN_MS } from './whisper.ts';

const noEnv = () => undefined;
const http = resolveWhisperConfig(noEnv, { enabled: true, worker_url: 'https://stt.example.test/jobs/', secret: 's3cret' });
const job = { jobId: 'j1', kind: 'video', ref: '42', mediaUrl: 'https://cdn.test/v.mp4', diarize: false, callbackUrl: 'https://fn.test/transcribe' };

test('the switch is off until the row says on', () => {
  assert.equal(resolveWhisperConfig(noEnv, { enabled: false, worker_url: 'https://a.test', secret: 's' }).configured, false);
  assert.equal(resolveWhisperConfig(noEnv, null).configured, false);
  assert.equal(http.configured, true);
  assert.equal(http.url, 'https://stt.example.test');
});

test('a plain-http worker is never used', () => {
  assert.equal(resolveWhisperConfig(noEnv, { enabled: true, worker_url: 'http://a.test', secret: 's' }).configured, false);
});

test('runpod needs both the key and the endpoint', () => {
  assert.equal(resolveWhisperConfig(noEnv, { enabled: true, secret: 's', runpod_api_key: 'k' }).configured, false);
  assert.equal(resolveWhisperConfig(noEnv, { enabled: true, secret: 's', runpod_api_key: 'k', runpod_endpoint_id: 'e' }).configured, true);
});

test('http dispatch carries the secret as a bearer and a start-by deadline', async () => {
  let seen: any;
  const res = await dispatchWhisper(http, job, 1_000_000, (async (url: string, init: any) => {
    seen = { url, init };
    return new Response('{}', { status: 202 });
  }) as any);
  assert.deepEqual(res, { ok: true });
  assert.equal(seen.url, 'https://stt.example.test/jobs');
  assert.equal(seen.init.headers.Authorization, 'Bearer s3cret');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.input.startBy, Math.floor((1_000_000 + WHISPER_START_WITHIN_MS) / 1000));
  assert.equal(body.input.secret, undefined);
});

test('runpod dispatch puts the callback secret in the job, the key in the header', async () => {
  const cfg = resolveWhisperConfig(noEnv, { enabled: true, secret: 's', runpod_api_key: 'key', runpod_endpoint_id: 'ep' });
  let seen: any;
  await dispatchWhisper(cfg, job, Date.now(), (async (url: string, init: any) => {
    seen = { url, init };
    return new Response('{"id":"r"}', { status: 200 });
  }) as any);
  assert.equal(seen.url, 'https://api.runpod.ai/v2/ep/run');
  assert.equal(seen.init.headers.Authorization, 'Bearer key');
  assert.equal(JSON.parse(seen.init.body).input.secret, 's');
});

test('a full or broken worker is a reason to fall back', async () => {
  const busy = await dispatchWhisper(http, job, Date.now(), (async () => new Response('', { status: 503 })) as any);
  assert.deepEqual(busy, { ok: false, reason: 'whisper worker 503' });
  const down = await dispatchWhisper(http, job, Date.now(), (async () => { throw new TypeError('connection refused'); }) as any);
  assert.equal(down.ok, false);
});

test('results keep speakers, drop words and blank lines', () => {
  const r = fromWhisper({
    language: 'fr',
    duration: 61.7,
    model: 'small',
    segments: [
      { start: 0, end: 1.2, text: ' Bonjour ', speaker: 'speaker_0', words: [{ start: 0, end: 1.2, word: 'Bonjour' }] },
      { start: 1.3, end: 1.5, text: '  ' },
      { start: 2, end: 3, text: 'à tous' },
    ],
  });
  assert.deepEqual(r.segments, [{ start: 0, end: 1.2, text: 'Bonjour', speaker: 'speaker_0' }, { start: 2, end: 3, text: 'à tous' }]);
  assert.equal(r.fullText, 'Bonjour à tous');
  assert.equal(r.lang, 'fr');
  assert.equal(r.durationSeconds, 61);
  assert.equal(r.model, 'small');
});

test('a result without segments is refused, not stored as silence', () => {
  assert.throws(() => fromWhisper({ ok: true }), /no segments/);
});

test('secrets compare exactly', () => {
  assert.equal(secretMatches('abc', 'abc'), true);
  assert.equal(secretMatches('abd', 'abc'), false);
  assert.equal(secretMatches('', ''), false);
});
