import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseline, bucketize, findSpikes, liveSpike, MIN_GAP_S, type StreamEvent, weight } from './spikes.ts';

/** A steady trickle: one message every 20 s for `seconds`. */
function trickle(seconds: number, every = 20): StreamEvent[] {
  const out: StreamEvent[] = [];
  for (let t = 5; t < seconds; t += every) out.push({ t, kind: 'chat' });
  return out;
}

function burst(at: number, count: number, kind: StreamEvent['kind'] = 'chat', amount?: number): StreamEvent[] {
  return Array.from({ length: count }, (_, i) => ({ t: at + (i % 20), kind, amount }));
}

test('weights: chat 1, reaction half, gifts more with size but capped', () => {
  assert.equal(weight({ t: 0, kind: 'chat' }), 1);
  assert.equal(weight({ t: 0, kind: 'reaction' }), 0.5);
  assert.equal(weight({ t: 0, kind: 'gift', amount: 0 }), 4);
  assert.ok(weight({ t: 0, kind: 'gift', amount: 1000 }) > weight({ t: 0, kind: 'gift', amount: 10 }));
  assert.ok(weight({ t: 0, kind: 'gift', amount: 1e12 }) <= 10);
});

test('bucketize drops events outside the broadcast', () => {
  const { total } = bucketize([{ t: -1, kind: 'chat' }, { t: 5, kind: 'chat' }, { t: 99, kind: 'chat' }], 30);
  assert.deepEqual(total, [1, 0, 0]);
});

test('baseline spread never falls below one message', () => {
  assert.deepEqual(baseline([0, 0, 0, 0]), { centre: 0, spread: 1 });
});

test('a quiet stream has no highlights', () => {
  assert.deepEqual(findSpikes(trickle(1800), 1800), []);
});

test('a chat burst is found, with the cut reaching back before it', () => {
  const events = [...trickle(1800), ...burst(600, 30)];
  const spikes = findSpikes(events, 1800);
  assert.equal(spikes.length, 1);
  const [s] = spikes;
  assert.equal(s.reason, 'chat');
  assert.ok(s.at >= 580 && s.at <= 610, `at ${s.at}`);
  assert.ok(s.start < s.at && s.end > s.at);
  assert.ok(s.end - s.start >= 30 && s.end - s.start <= 75);
  assert.ok(s.windowStart <= s.start && s.windowEnd >= s.end);
});

test('gift bursts are labelled as gifts', () => {
  const events = [...trickle(1800), ...burst(900, 3, 'gift', 5000)];
  const [s] = findSpikes(events, 1800);
  assert.equal(s.reason, 'gifts');
});

test('strongest first, never two inside the minimum gap, capped', () => {
  const events = [
    ...trickle(3600),
    ...burst(300, 12),
    ...burst(340, 40), // same moment as 300
    ...burst(1200, 25),
    ...burst(2400, 18),
  ];
  const spikes = findSpikes(events, 3600, 2);
  assert.equal(spikes.length, 2);
  assert.ok(spikes[0].score >= spikes[1].score);
  assert.ok(Math.abs(spikes[0].at - spikes[1].at) >= MIN_GAP_S);
});

test('cuts stay inside the broadcast', () => {
  const events = [...burst(2, 30), ...trickle(400)];
  const spikes = findSpikes(events, 400);
  for (const s of spikes) {
    assert.ok(s.start >= 0 && s.windowStart >= 0);
    assert.ok(s.end <= 400 && s.windowEnd <= 400);
  }
});

test('live: a burst in the last half-minute is a spike', () => {
  const now = 900;
  const s = liveSpike([...trickle(now), ...burst(now - 25, 20)], now);
  assert.ok(s);
  assert.equal(s!.reason, 'chat');
  assert.ok(s!.end <= now);
});

test('live: nothing without a burst, or without enough history', () => {
  assert.equal(liveSpike(trickle(900), 900), null);
  assert.equal(liveSpike(burst(70, 30), 100), null);
});
