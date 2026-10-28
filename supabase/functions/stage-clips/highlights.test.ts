import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  END_CARD_S, MAX_CLIP_S, MIN_CLIP_S, assEscape, assTime, buildAss, buildCues, candidateWindows, clipWords,
  hostBlocksClips, looksMature, normalizeSegments, parseSuggestions, pickHighlights, scoreWindow, snapSuggestion,
  type Segment,
} from '../_shared/clip-highlights.ts';

/** A talk of `n` back-to-back 5-second lines, two of which open a new thought. */
function talk(n = 40): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < n; i++) {
    let text = 'and then we kind of moved on to the next part of it,';
    if (i % 12 === 0) text = 'Here’s the thing nobody tells you about building in public.';
    else if (i % 12 === 9) text = 'That is why the community matters more than the code.';
    else if (i % 12 === 10) text = 'um so yeah anyway';
    out.push({ start: i * 5, end: i * 5 + 4.8, text, speaker: 'speaker_1' });
  }
  return out;
}

test('normalizeSegments drops broken rows and sorts by time', () => {
  const segs = normalizeSegments([
    { start: 5, end: 6, text: ' b  ' },
    { start: 1, end: 2, text: 'a' },
    { start: 3, end: 2, text: 'backwards' },
    { start: 'x', end: 4, text: 'nan' },
    { start: 7, end: 8, text: '' },
  ]);
  assert.deepEqual(segs.map((s) => s.text), ['a', 'b']);
});

test('candidate windows are 30-60 s and aligned to segment edges', () => {
  const segs = talk();
  const windows = candidateWindows(segs);
  assert.ok(windows.length > 0);
  for (const w of windows) {
    const d = w.end - w.start;
    assert.ok(d >= MIN_CLIP_S && d <= MAX_CLIP_S, `duration ${d}`);
    assert.ok(segs.some((s) => s.start === w.start));
    assert.ok(segs.some((s) => s.end === w.end));
  }
});

test('a strong opener ending on a full stop outscores a mid-sentence fragment', () => {
  const segs = talk();
  // 0..9: opens "Here's the thing", ends "That is why ... code."
  const good = scoreWindow(segs, 0, 9);
  // 1..8: opens "and then", ends on a comma.
  const bad = scoreWindow(segs, 1, 8);
  assert.ok(good > bad, `${good} <= ${bad}`);
});

test('pickHighlights returns at most three clips that do not overlap', () => {
  const picks = pickHighlights(talk(80));
  assert.ok(picks.length >= 1 && picks.length <= 3);
  const sorted = [...picks].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].start >= sorted[i - 1].end - 5);
  assert.match(picks[0].hook, /^Here’s the thing/);
});

test('pickHighlights finds nothing in a stage shorter than a clip', () => {
  assert.deepEqual(pickHighlights(talk(4)), []);
});

test('suggested windows are snapped to whole lines and win ties', () => {
  const segs = talk(80);
  const snapped = snapSuggestion(segs, { start: 241.3, end: 290.2 });
  assert.ok(snapped);
  assert.equal(snapped!.start, 240);
  assert.ok(segs.some((s) => s.end === snapped!.end));
  const d = snapped!.end - snapped!.start;
  assert.ok(d >= MIN_CLIP_S && d <= MAX_CLIP_S);

  const picks = pickHighlights(segs, [{ start: 240, end: 289, hook: 'Here’s the thing', title: 'Build in public' }]);
  assert.equal(picks[0].start, 240);
  assert.equal(picks[0].title, 'Build in public');
});

test('a suggestion too short to stretch, or outside the talk, is dropped', () => {
  const segs = talk(5); // 25 s in all
  assert.equal(snapSuggestion(segs, { start: 0, end: 20 }), null);
  assert.equal(snapSuggestion(talk(), { start: 9000, end: 9040 }), null);
});

test('parseSuggestions reads fenced or chatty JSON and skips junk', () => {
  const raw = 'Sure!\n```json\n[{"start": 10, "end": 50, "hook": "Hi", "title": "T"}, {"start": "x"}, {"start": 9, "end": 3}]\n```';
  assert.deepEqual(parseSuggestions(raw), [{ start: 10, end: 50, hook: 'Hi', title: 'T' }]);
  assert.deepEqual(parseSuggestions('no json here'), []);
  assert.deepEqual(parseSuggestions(null), []);
});

test('clipWords puts every word on the clip clock, in order, inside the clip', () => {
  const segs: Segment[] = [
    { start: 98, end: 101, text: 'cut before this line' },
    { start: 101, end: 104, text: 'Short words and extraordinarily long ones' },
    { start: 104.5, end: 106, text: 'End.' },
  ];
  const ws = clipWords(segs, 100, 106);
  assert.equal(ws[0].text, 'line');
  for (let i = 0; i < ws.length; i++) {
    assert.ok(ws[i].start >= 0 && ws[i].end <= 6 && ws[i].end > ws[i].start);
    if (i) assert.ok(ws[i].start >= ws[i - 1].end - 0.011);
  }
  const long = ws.find((w) => w.text === 'extraordinarily')!;
  const short = ws.find((w) => w.text === 'and')!;
  assert.ok(long.end - long.start > short.end - short.start);
  // A segment's words share its whole span.
  const seg = ws.filter((w) => w.start >= 1 && w.end <= 4.01);
  assert.equal(seg[0].start, 1);
  assert.equal(seg[seg.length - 1].end, 4);
});

test('buildCues keeps lines short, breaks at pauses and sentence ends, and never overlaps', () => {
  const segs: Segment[] = [
    { start: 0, end: 6, text: 'This is a fairly long sentence that should wrap across several caption lines. Next one' },
    { start: 8, end: 9, text: 'after a pause' },
  ];
  const cues = buildCues(clipWords(segs, 0, 10));
  for (const c of cues) {
    const text = c.words.map((w) => w.text).join(' ');
    assert.ok(text.length <= 22 || c.words.length === 1, text);
    assert.ok(c.end > c.start);
  }
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= cues[i - 1].end);
  assert.ok(cues.some((c) => c.words[c.words.length - 1].text === 'lines.'));
  assert.equal(cues.find((c) => c.words[0].text === 'after')!.start, 8);
});

test('a new transcript line starts a new caption', () => {
  const cues = buildCues(clipWords([{ start: 0, end: 1, text: 'several words' }, { start: 1.1, end: 2, text: 'And more' }], 0, 3));
  assert.deepEqual(cues.map((c) => c.words.map((w) => w.text).join(' ')), ['several words', 'And more']);
});

test('a lone short word stays up long enough to read', () => {
  const cues = buildCues([{ text: 'Yes.', start: 1, end: 1.1 }]);
  assert.equal(cues[0].end, 1.6);
});

test('assTime and assEscape', () => {
  assert.equal(assTime(0), '0:00:00.00');
  assert.equal(assTime(61.234), '0:01:01.23');
  assert.equal(assTime(3725.5), '1:02:05.50');
  assert.equal(assEscape('a {\\b1} \\N b'), 'a (⧵b1) ⧵N b');
});

test('buildAss times captions, watermark and end card to the clip', () => {
  const cues = buildCues(clipWords([{ start: 0, end: 2, text: 'Hello {world}' }], 0, 40));
  const ass = buildAss(cues, 40, { title: 'Hear the full Stage', url: 'dehub.io/stages/42', host: 'Maya' });
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /PlayResY: 1920/);
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:02\.00,Caption,,0,0,0,,\{\\k\d+\}Hello \{\\k\d+\}\(world\)/);
  assert.match(ass, /Dialogue: 1,0:00:00\.00,0:00:40\.00,Mark,,0,0,0,,DeHub/);
  assert.match(ass, new RegExp(`0:00:40\\.00,0:00:${40 + END_CARD_S}\\.00,CardUrl,.*dehub\\.io/stages/42`));
  // Karaoke durations add up to the cue.
  const ks = [...ass.matchAll(/\\k(\d+)/g)].map((m) => Number(m[1]));
  assert.equal(ks.reduce((a, b) => a + b, 0), 200);
});

test('mature wording and blocked hosts keep a stage out', () => {
  assert.equal(looksMature('Late night NSFW talk'), true);
  assert.equal(looksMature('Sussex builders meetup'), false);
  assert.equal(looksMature('Web3 builders', 'weekly call'), false);
  assert.equal(hostBlocksClips(null), true);
  assert.equal(hostBlocksClips({ matureAccount: true }), true);
  assert.equal(hostBlocksClips({ isBanned: false }), false);
});
