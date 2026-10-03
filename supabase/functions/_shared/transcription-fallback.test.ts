import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transcribeWithFallback } from './transcription-fallback.ts';

const empty = { segments: [], fullText: '', durationSeconds: 75, provider: 'deepgram' };
const lyrics = { segments: [{ text: 'Decentralized, we play the game' }], fullText: 'Decentralized, we play the game', durationSeconds: null, provider: 'elevenlabs' };

test('a primary transcript does not spend on a fallback', async () => {
  const result = await transcribeWithFallback(async () => lyrics, async () => { throw new Error('unexpected fallback'); });
  assert.equal(result, lyrics);
});

test('empty recognition recovers lyrics and retains the media duration', async () => {
  let calls = 0;
  const result = await transcribeWithFallback(async () => empty, async () => { calls++; return lyrics; });
  assert.equal(calls, 1);
  assert.equal(result.provider, 'elevenlabs');
  assert.equal(result.durationSeconds, 75);
  assert.deepEqual(result.segments, lyrics.segments);
});

test('an unsuccessful fallback remains empty and records the second engine', async () => {
  const result = await transcribeWithFallback(async () => empty, async () => ({ ...empty, provider: 'elevenlabs' }));
  assert.equal(result.provider, 'elevenlabs');
  assert.deepEqual(result.segments, []);
});

test('fallback errors remain failures so the job can retry', async () => {
  await assert.rejects(transcribeWithFallback(async () => empty, async () => { throw new Error('Scribe 503'); }), /Scribe 503/);
});
