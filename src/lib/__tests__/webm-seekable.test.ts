// @vitest-environment node
//
// Not jsdom: its Blob has no arrayBuffer(), so every slice this pass reads
// throws and the module dutifully hands the input straight back. Real browsers
// have had it since Chrome 76, and nothing here touches the DOM.

/**
 * The invariant that matters here is not "a Cues element exists" — it is that
 * every CueClusterPosition names a byte that is still the start of the cluster
 * it claims, in the file we actually write.
 *
 * The first version of this pass got that wrong in a way nothing else would
 * have caught: cue positions were recorded against the *input* layout, while
 * inserting a SeekHead and a Duration pushes every cluster 79 bytes further
 * into the output. The file parsed, played start to finish, and reported the
 * right duration — every seek just landed in the middle of the header. So the
 * test walks the index and dereferences it, rather than trusting its shape.
 */
import { describe, it, expect } from 'vitest';
import { makeWebmSeekable } from '@/lib/webm-seekable';

// ─── A MediaRecorder-shaped WebM, built the way Chrome builds one ──────────
// Unknown-size Segment, unknown-size clusters, no Duration, no Cues.

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function sizeVint(value: number): Uint8Array {
  let length = 1;
  while (length < 8 && value >= Math.pow(2, 7 * length) - 1) length++;
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i > 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
  out[0] = v | (0x80 >> (length - 1));
  return out;
}

function uint(value: number): Uint8Array {
  let length = 1;
  while (length < 8 && value >= Math.pow(2, 8 * length)) length++;
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
  return out;
}

const id = (...bytes: number[]) => new Uint8Array(bytes);
const el = (elementId: Uint8Array, payload: Uint8Array) =>
  concat([elementId, sizeVint(payload.length), payload]);
const uintEl = (elementId: Uint8Array, value: number) => el(elementId, uint(value));
const strEl = (elementId: Uint8Array, value: string) =>
  el(elementId, new TextEncoder().encode(value));

const EBML_HEADER = el(id(0x1a, 0x45, 0xdf, 0xa3), concat([
  uintEl(id(0x42, 0x86), 1),
  uintEl(id(0x42, 0xf7), 1),
  uintEl(id(0x42, 0xf2), 4),
  uintEl(id(0x42, 0xf3), 8),
  strEl(id(0x42, 0x82), 'webm'),
  uintEl(id(0x42, 0x87), 4),
  uintEl(id(0x42, 0x85), 2),
]));

/** Segment with EBML's unknown-size marker, exactly as MediaRecorder writes it. */
const SEGMENT_HEADER = concat([
  id(0x18, 0x53, 0x80, 0x67),
  id(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff),
]);

const INFO = el(id(0x15, 0x49, 0xa9, 0x66), concat([
  uintEl(id(0x2a, 0xd7, 0xb1), 1_000_000),
  strEl(id(0x4d, 0x80), 'Chrome'),
  strEl(id(0x57, 0x41), 'Chrome'),
]));

const TRACKS = el(id(0x16, 0x54, 0xae, 0x6b), el(id(0xae), concat([
  uintEl(id(0xd7), 1),
  uintEl(id(0x73, 0xc5), 1),
  uintEl(id(0x83), 2),
  strEl(id(0x86), 'A_OPUS'),
])));

/** One unknown-size cluster holding `blocks` 20 ms SimpleBlocks. */
function cluster(timecode: number, blocks: number): Uint8Array {
  const parts: Uint8Array[] = [uintEl(id(0xe7), timecode)];
  for (let i = 0; i < blocks; i++) {
    const relative = i * 20;
    const payload = new Uint8Array(4 + 12);
    payload[0] = 0x81;                       // track 1
    payload[1] = (relative >> 8) & 0xff;     // int16 BE, big end first
    payload[2] = relative & 0xff;
    payload[3] = 0x80;                       // keyframe flag
    payload.fill(0x42, 4);                   // stand-in for Opus frame data
    parts.push(el(id(0xa3), payload));
  }
  return concat([
    id(0x1f, 0x43, 0xb6, 0x75),
    id(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff),
    concat(parts),
  ]);
}

function recorderWebm(clusterCount: number): { bytes: Uint8Array; clusterRegion: Uint8Array } {
  const clusters: Uint8Array[] = [];
  for (let i = 0; i < clusterCount; i++) clusters.push(cluster(i * 1000, 50));
  const clusterRegion = concat(clusters);
  return {
    bytes: concat([EBML_HEADER, SEGMENT_HEADER, INFO, TRACKS, clusterRegion]),
    clusterRegion,
  };
}

const blobOf = (bytes: Uint8Array) => new Blob([bytes], { type: 'audio/webm' });

// ─── Just enough of a reader to dereference the index ──────────────────────

interface Header { id: number; size: number; unknown: boolean; headerLength: number }

function vint(buf: Uint8Array, pos: number, strip: boolean) {
  const first = buf[pos];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while ((first & mask) === 0) { mask >>= 1; length++; }
  const valueMask = 0xff >> length;
  let value = strip ? first & valueMask : first;
  let unknown = (first & valueMask) === valueMask;
  for (let i = 1; i < length; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) unknown = false;
  }
  return { value, length, unknown };
}

function header(buf: Uint8Array, pos: number): Header | null {
  const elementId = vint(buf, pos, false);
  if (!elementId) return null;
  const size = vint(buf, pos + elementId.length, true);
  if (!size) return null;
  return {
    id: elementId.value,
    size: size.unknown ? 0 : size.value,
    unknown: size.unknown,
    headerLength: elementId.length + size.length,
  };
}

function readUint(buf: Uint8Array, pos: number, length: number) {
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + buf[pos + i];
  return value;
}

/** Every level-1 element, with offsets relative to the Segment's content. */
function segmentChildren(bytes: Uint8Array) {
  const ebml = header(bytes, 0)!;
  const segment = header(bytes, ebml.headerLength + ebml.size)!;
  const contentStart = ebml.headerLength + ebml.size + segment.headerLength;
  const found: { id: number; position: number; absolute: number; header: Header }[] = [];
  let pos = contentStart;
  while (pos < bytes.length) {
    const el = header(bytes, pos);
    if (!el) break;
    found.push({ id: el.id, position: pos - contentStart, absolute: pos, header: el });
    if (el.unknown) break; // clusters — the walk stops here
    pos += el.headerLength + el.size;
  }
  return { contentStart, found, segment };
}

async function bytesOf(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('makeWebmSeekable', () => {
  it('writes a Duration derived from the audio, not from the wall clock', async () => {
    // 10 clusters, each 50 blocks × 20 ms: the last block starts at 9980 ms
    // and runs for one more frame.
    const result = await makeWebmSeekable(blobOf(recorderWebm(10).bytes));
    expect(result.changed, result.reason).toBe(true);
    expect(result.durationMs).toBe(10_000);
    expect(result.cuePoints).toBe(10);
  });

  it('points a SeekHead at the Cues, which is what makes ExoPlayer look', async () => {
    const result = await makeWebmSeekable(blobOf(recorderWebm(5).bytes));
    const out = await bytesOf(result.blob);
    const { contentStart, found } = segmentChildren(out);

    // The SeekHead must come first: ExoPlayer decides seekability the moment
    // it meets a cluster, so a pointer arriving later is a pointer ignored.
    expect(found[0].id).toBe(0x114d9b74);

    const seekHead = found[0];
    const targets = new Map<number, number>();
    let pos = seekHead.absolute + seekHead.header.headerLength;
    const end = pos + seekHead.header.size;
    while (pos < end) {
      const entry = header(out, pos)!;
      let seekId = 0;
      let seekPosition = 0;
      let field = pos + entry.headerLength;
      while (field < pos + entry.headerLength + entry.size) {
        const f = header(out, field)!;
        const at = field + f.headerLength;
        if (f.id === 0x53ab) seekId = readUint(out, at, f.size);
        if (f.id === 0x53ac) seekPosition = readUint(out, at, f.size);
        field = at + f.size;
      }
      targets.set(seekId, seekPosition);
      pos += entry.headerLength + entry.size;
    }

    // Every pointer must dereference to the element it claims.
    for (const [target, position] of targets) {
      expect(header(out, contentStart + position)!.id).toBe(target);
    }
    expect(targets.has(0x1c53bb6b)).toBe(true); // Cues
  });

  it('gives every cue a position that is still a cluster after the rewrite', async () => {
    const result = await makeWebmSeekable(blobOf(recorderWebm(24).bytes));
    const out = await bytesOf(result.blob);
    const { contentStart, found } = segmentChildren(out);

    // Cues sit after the clusters, so find them from the tail of the file.
    const clusterStart = found[found.length - 1].absolute;
    let pos = clusterStart;
    while (pos < out.length) {
      const el = header(out, pos)!;
      if (el.id === 0x1c53bb6b) break;
      // Walk an unknown-size cluster by its children.
      let q = pos + el.headerLength;
      while (q < out.length) {
        const child = header(out, q)!;
        if (child.id === 0x1f43b675 || child.id === 0x1c53bb6b) break;
        q += child.headerLength + child.size;
      }
      pos = q;
    }
    const cues = header(out, pos)!;
    expect(cues.id).toBe(0x1c53bb6b);

    let seen = 0;
    let cue = pos + cues.headerLength;
    const cuesEnd = cue + cues.size;
    while (cue < cuesEnd) {
      const point = header(out, cue)!;
      let cueTime = -1;
      let cuePosition = -1;
      let field = cue + point.headerLength;
      while (field < cue + point.headerLength + point.size) {
        const f = header(out, field)!;
        const at = field + f.headerLength;
        if (f.id === 0xb3) cueTime = readUint(out, at, f.size);
        if (f.id === 0xb7) {
          let g = at;
          while (g < at + f.size) {
            const inner = header(out, g)!;
            if (inner.id === 0xf1) {
              cuePosition = readUint(out, g + inner.headerLength, inner.size);
            }
            g += inner.headerLength + inner.size;
          }
        }
        field = at + f.size;
      }

      // Dereference: the byte named must start a Cluster whose Timecode is
      // the CueTime. This is the assertion that would have failed before.
      const target = header(out, contentStart + cuePosition)!;
      expect(target.id).toBe(0x1f43b675);
      const timecode = header(out, contentStart + cuePosition + target.headerLength)!;
      expect(timecode.id).toBe(0xe7);
      const at = contentStart + cuePosition + target.headerLength + timecode.headerLength;
      expect(readUint(out, at, timecode.size)).toBe(cueTime);

      seen++;
      cue += point.headerLength + point.size;
    }
    expect(seen).toBe(24);
  });

  it('copies the cluster payload through byte for byte', async () => {
    // Nothing is re-encoded, so the audio must survive bit-for-bit; only the
    // bytes around it move.
    const { bytes, clusterRegion } = recorderWebm(8);
    const result = await makeWebmSeekable(blobOf(bytes));
    const out = await bytesOf(result.blob);
    const found = segmentChildren(out).found;
    const clustersAt = found[found.length - 1].absolute;
    expect(Array.from(out.subarray(clustersAt, clustersAt + clusterRegion.length)))
      .toEqual(Array.from(clusterRegion));
  });

  it('leaves a file it has already finalised alone', async () => {
    const once = await makeWebmSeekable(blobOf(recorderWebm(6).bytes));
    expect(once.changed).toBe(true);
    const twice = await makeWebmSeekable(once.blob);
    expect(twice.changed).toBe(false);
    expect(twice.reason).toBe('already has a Cues index');
    expect(twice.blob.size).toBe(once.blob.size);
  });

  it('carries a concatenated second stream through untouched', async () => {
    // What a mid-recording voice-effect switch produces: a second complete
    // WebM appended to the same chunk array.
    const { bytes } = recorderWebm(4);
    const result = await makeWebmSeekable(blobOf(concat([bytes, bytes])));
    expect(result.changed).toBe(true);
    expect(result.cuePoints).toBe(4); // only the first stream is indexed
    const out = await bytesOf(result.blob);
    const tail = out.subarray(out.length - bytes.length);
    expect(Array.from(tail)).toEqual(Array.from(bytes));
  });

  it('hands back anything it does not fully understand', async () => {
    const cases: [string, Blob][] = [
      ['empty', new Blob([])],
      ['not EBML', blobOf(new Uint8Array(512).fill(0x5a))],
      ['header with no clusters', blobOf(concat([EBML_HEADER, SEGMENT_HEADER, INFO, TRACKS]))],
      ['truncated mid-cluster', blobOf(recorderWebm(4).bytes.subarray(0, 600))],
    ];
    for (const [name, input] of cases) {
      const result = await makeWebmSeekable(input);
      expect(result.changed, name).toBe(false);
      expect(result.blob, name).toBe(input); // the very same object, not a copy
      expect(result.reason, name).toBeTruthy();
    }
  });
});
