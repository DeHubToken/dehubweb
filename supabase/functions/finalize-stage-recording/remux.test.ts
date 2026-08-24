// Self-contained checks for the container surgery in this directory.
//
// The fixtures are built here rather than committed, so this runs anywhere in
// under a second with no binary blobs in the repo and no test framework. Run it
// with a Node that can strip types:
//
//   node --experimental-strip-types remux.test.ts
//
// It is wired into CI as the "Stage remux" job. What it guards is the property
// that matters and that a human reviewer cannot eyeball: every byte offset the
// index claims must land on the thing it names. Getting that wrong produces a
// file that looks fine, uploads fine, and silently cannot be seeked — which is
// the exact bug this code exists to fix.

import { ID, concat, element, readChildren, readId, readSize, readUint, uintBytes, writeId } from './ebml.ts';
import { repairWebm, AlreadyIndexed } from './webm.ts';
import { parseAdts, isAdts, AAC_SAMPLES_PER_FRAME } from './adts.ts';
import { buildM4a, readBoxes, findPath } from './mp4.ts';

let failures = 0;
function ok(cond: boolean, what: string) {
  if (!cond) failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${what}`);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

/** The unknown-size VINT MediaRecorder writes while streaming. */
const UNKNOWN = Uint8Array.of(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);

const CLUSTERS = 40;
const BLOCKS_PER_CLUSTER = 17;
const FRAME_MS = 60;

/**
 * A WebM shaped like Chrome's: Segment and Clusters of unknown size, an Info
 * with no Duration, and no Cues anywhere.
 */
function syntheticWebm(): Uint8Array {
  const header = element(ID.EBML, element(0x4286, uintBytes(1, 1), 1), 1);
  const info = element(ID.Info, element(ID.TimecodeScale, uintBytes(1_000_000, 3), 1), 1);
  const tracks = element(ID.Tracks,
    element(0xae, concat([
      element(0xd7, uintBytes(1, 1), 1),                                   // TrackNumber
      element(0x83, uintBytes(2, 1), 1),                                   // TrackType: audio
      element(0x86, Uint8Array.from('A_OPUS', (c) => c.charCodeAt(0)), 1), // CodecID
    ]), 1), 1);

  const parts: Uint8Array[] = [header, writeId(ID.Segment), UNKNOWN, info, tracks];
  let t = 0;
  for (let c = 0; c < CLUSTERS; c++) {
    const body: Uint8Array[] = [element(ID.Timecode, uintBytes(t, 4), 1)];
    for (let i = 0; i < BLOCKS_PER_CLUSTER; i++) {
      const rel = i * FRAME_MS;
      // Block: track vint, signed int16 relative timestamp, flags, payload.
      const payload = Uint8Array.from({ length: 24 }, (_, k) => (c * 31 + i * 7 + k) & 0xff);
      body.push(element(ID.SimpleBlock, concat([
        Uint8Array.of(0x81, (rel >> 8) & 0xff, rel & 0xff, 0x80),
        payload,
      ]), 1));
    }
    parts.push(writeId(ID.Cluster), UNKNOWN, concat(body));
    t += BLOCKS_PER_CLUSTER * FRAME_MS;
  }
  return concat(parts);
}

const AAC_FRAMES = 500;

/** An ADTS AAC elementary stream shaped like Agora's: 44.1 kHz, stereo. */
function syntheticAdts(): { bytes: Uint8Array; payloads: Uint8Array[] } {
  const freqIndex = 4; // 44100
  const channels = 2;
  const payloads: Uint8Array[] = [];
  const parts: Uint8Array[] = [];
  for (let i = 0; i < AAC_FRAMES; i++) {
    const size = 100 + (i % 53);
    const payload = Uint8Array.from({ length: size }, (_, k) => (i * 13 + k) & 0xff);
    payloads.push(payload);
    const len = size + 7;
    parts.push(Uint8Array.of(
      0xff, 0xf1,                                                  // sync, MPEG-4, no CRC
      (1 << 6) | (freqIndex << 2) | ((channels >> 2) & 1),         // profile AAC-LC, rate, chan hi
      ((channels & 3) << 6) | ((len >> 11) & 3),
      (len >> 3) & 0xff,
      ((len & 7) << 5) | 0x1f,
      0xfc,
    ), payload);
  }
  return { bytes: concat(parts), payloads };
}

// ── WebM ────────────────────────────────────────────────────────────────────

console.log('# webm repair');
const rawWebm = syntheticWebm();
const repaired = repairWebm(rawWebm);
const w = repaired.bytes;

const wTop = readChildren(w, 0, w.length);
const wSeg = wTop.find((e) => e.id === ID.Segment)!;
ok(!!wSeg && !wSeg.unknownSize, 'segment size is known');
ok(wSeg.end === w.length, 'segment covers the file exactly');

const wKids = readChildren(w, wSeg.dataStart, wSeg.end);
const wClusters = wKids.filter((e) => e.id === ID.Cluster);
ok(wClusters.length === CLUSTERS, `all ${CLUSTERS} clusters survive`);
ok(wClusters.every((c) => !c.unknownSize), 'no cluster keeps an unknown size');

const expectedMs = (CLUSTERS * BLOCKS_PER_CLUSTER) * FRAME_MS;
ok(repaired.durationMs === expectedMs, `duration is ${expectedMs}ms (got ${repaired.durationMs})`);
const wInfo = wKids.find((e) => e.id === ID.Info)!;
const durEl = readChildren(w, wInfo.dataStart, wInfo.end).find((e) => e.id === ID.Duration)!;
ok(!!durEl, 'Info gained a Duration');
ok(
  new DataView(w.buffer, w.byteOffset + durEl.dataStart, 8).getFloat64(0, false) === expectedMs,
  'the Duration element reads back correctly',
);

// The whole point: every index offset must land on what it claims.
const cuesEl = wKids.find((e) => e.id === ID.Cues)!;
ok(!!cuesEl, 'Cues present');
const cuePoints = readChildren(w, cuesEl.dataStart, cuesEl.end);
ok(cuePoints.length === CLUSTERS, 'one CuePoint per cluster');
let badCue = 0;
for (const cp of cuePoints) {
  const f = readChildren(w, cp.dataStart, cp.end);
  const ctp = f.find((x) => x.id === ID.CueTrackPositions)!;
  const posEl = readChildren(w, ctp.dataStart, ctp.end).find((x) => x.id === ID.CueClusterPosition)!;
  const pos = readUint(w, posEl.dataStart, posEl.end - posEl.dataStart);
  if (readId(w, wSeg.dataStart + pos).id !== ID.Cluster) badCue++;
}
ok(badCue === 0, 'every CueClusterPosition lands on a Cluster');

const shEl = wKids.find((e) => e.id === ID.SeekHead)!;
let badSeek = 0;
for (const s of readChildren(w, shEl.dataStart, shEl.end)) {
  const f = readChildren(w, s.dataStart, s.end);
  const target = readId(w, f.find((x) => x.id === ID.SeekID)!.dataStart).id;
  const posEl = f.find((x) => x.id === ID.SeekPosition)!;
  const pos = readUint(w, posEl.dataStart, posEl.end - posEl.dataStart);
  if (readId(w, wSeg.dataStart + pos).id !== target) badSeek++;
}
ok(badSeek === 0, 'every SeekHead entry lands on the element it names');

function blockPayloads(buf: Uint8Array): Uint8Array[] {
  const seg = readChildren(buf, 0, buf.length).find((e) => e.id === ID.Segment)!;
  const out: Uint8Array[] = [];
  for (const c of readChildren(buf, seg.dataStart, seg.end)) {
    if (c.id !== ID.Cluster) continue;
    for (const el of readChildren(buf, c.dataStart, c.end)) {
      if (el.id === ID.SimpleBlock) out.push(buf.subarray(el.dataStart, el.end));
    }
  }
  return out;
}
const before = blockPayloads(rawWebm);
const after = blockPayloads(w);
ok(before.length === after.length && before.length === CLUSTERS * BLOCKS_PER_CLUSTER, 'block count unchanged');
ok(
  before.every((x, i) => x.length === after[i].length && x.every((v, j) => v === after[i][j])),
  'every audio block is byte-identical',
);

let reRepaired = false;
try { repairWebm(w); } catch (e) { reRepaired = e instanceof AlreadyIndexed; }
ok(reRepaired, 'repairing an already-indexed file is refused');

// A voice-effect switch appends a second whole stream; players stop at the end
// of the first, and so must this — otherwise its unknown-size Segment swallows
// the Cues written after it.
const doubled = concat([rawWebm, rawWebm]);
const fromDoubled = repairWebm(doubled);
ok(fromDoubled.truncatedAtSecondStream, 'a second concatenated stream is detected');
ok(fromDoubled.clusters === CLUSTERS, 'only the first stream is kept');
const dSeg = readChildren(fromDoubled.bytes, 0, fromDoubled.bytes.length).find((e) => e.id === ID.Segment)!;
ok(
  readChildren(fromDoubled.bytes, dSeg.dataStart, dSeg.end).some((e) => e.id === ID.Cues),
  'the repaired first stream still has its Cues',
);

// ── ADTS → M4A ──────────────────────────────────────────────────────────────

console.log('\n# adts to m4a');
const { bytes: adts, payloads } = syntheticAdts();
ok(isAdts(adts), 'isAdts recognises the stream');
ok(!isAdts(rawWebm), 'isAdts rejects a WebM');

const parsed = parseAdts(adts);
ok(parsed.frames.length === AAC_FRAMES, `all ${AAC_FRAMES} frames parsed`);
ok(parsed.resyncs === 0, 'no resyncs on a clean stream');
ok(parsed.sampleRate === 44100 && parsed.channels === 2, 'rate and channels read from the header');
ok(
  parsed.frames.every((f, i) => f.length === payloads[i].length && f.every((v, j) => v === payloads[i][j])),
  'ADTS headers stripped without touching the payloads',
);

const m = buildM4a({
  samples: parsed.frames,
  samplesPerFrame: AAC_SAMPLES_PER_FRAME,
  sampleRate: parsed.sampleRate,
  channels: parsed.channels,
  asc: parsed.asc,
});
const mb = m.bytes;
const mdv = new DataView(mb.buffer, mb.byteOffset, mb.byteLength);
const boxes = readBoxes(mb, 0, mb.length);
ok(boxes.map((b) => b.type).join(',') === 'ftyp,moov,mdat', 'top level is ftyp,moov,mdat');
ok(boxes[boxes.length - 1].end === mb.length, 'boxes cover the file exactly');

const expectMs = Math.round((AAC_FRAMES * AAC_SAMPLES_PER_FRAME / 44100) * 1000);
ok(m.durationMs === expectMs, `duration is ${expectMs}ms (got ${m.durationMs})`);

const moov = boxes.find((b) => b.type === 'moov')!;
const mdat = boxes.find((b) => b.type === 'mdat')!;
const stbl = findPath(mb, moov.dataStart, moov.end, ['trak', 'mdia', 'minf', 'stbl'])!;
const tbl = (t: string) => readBoxes(mb, stbl.dataStart, stbl.end).find((b) => b.type === t);
ok(!!tbl('stts') && !!tbl('stsz') && !!tbl('stsc') && !!tbl('stco'), 'sample table is complete');

const stco = tbl('stco')!;
ok(mdv.getUint32(stco.dataStart + 8) === mdat.dataStart, 'stco points at mdat payload');

// Same property as the Cues check: walk the table and read the samples back.
const stsz = tbl('stsz')!;
const count = mdv.getUint32(stsz.dataStart + 8);
ok(count === AAC_FRAMES, 'stsz counts every sample');
let off = mdat.dataStart;
let mismatched = 0;
for (let i = 0; i < count; i++) {
  const size = mdv.getUint32(stsz.dataStart + 12 + i * 4);
  const got = mb.subarray(off, off + size);
  if (size !== payloads[i].length || !payloads[i].every((v, j) => v === got[j])) mismatched++;
  off += size;
}
ok(mismatched === 0, 'every sample is readable at its table offset and unchanged');
ok(off === mdat.end, 'the sample sizes exactly fill mdat');

const stsd = findPath(mb, stbl.dataStart, stbl.end, ['stsd'])!;
const entry = readBoxes(mb, stsd.dataStart + 8, stsd.end)[0];
ok(entry.type === 'mp4a', 'sample entry is mp4a');
// 16.16 fixed point: the field a 32-bit shift silently turns negative.
ok(mdv.getUint32(entry.dataStart + 24) >>> 16 === 44100, 'stsd sample rate survives 16.16 encoding');
ok(mdv.getUint16(entry.dataStart + 16) === 2, 'stsd channel count is right');

// ── Bad input must throw, never produce a plausible-looking file ────────────

console.log('\n# hostile input');
for (const [label, bytes] of [
  ['empty', new Uint8Array(0)],
  ['garbage', Uint8Array.from({ length: 2048 }, (_, i) => (i * 37) & 0xff)],
  ['header only', rawWebm.subarray(0, 40)],
] as const) {
  let threw = false;
  try { repairWebm(bytes); } catch { threw = true; }
  ok(threw, `repairWebm rejects ${label}`);
}
for (const [label, bytes] of [
  ['empty', new Uint8Array(0)],
  ['garbage', Uint8Array.from({ length: 2048 }, (_, i) => (i * 37) & 0xff)],
] as const) {
  let threw = false;
  try { parseAdts(bytes); } catch { threw = true; }
  ok(threw, `parseAdts rejects ${label}`);
}
// Truncation is survivable, but only if what comes out still re-parses.
const cut = parseAdts(adts.subarray(0, 12_345));
const cutM4a = buildM4a({
  samples: cut.frames, samplesPerFrame: AAC_SAMPLES_PER_FRAME,
  sampleRate: cut.sampleRate, channels: cut.channels, asc: cut.asc,
});
const cutBoxes = readBoxes(cutM4a.bytes, 0, cutM4a.bytes.length);
ok(
  cutBoxes.map((b) => b.type).join(',') === 'ftyp,moov,mdat' && cutBoxes[2].end === cutM4a.bytes.length,
  'a truncated ADTS stream still yields a well-formed MP4',
);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures ? 1 : 0);
