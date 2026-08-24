// A minimal, audio-only MP4 (M4A) muxer.
//
// It writes exactly the boxes a player needs to seek: a sample table (stts /
// stsz / stsc / stco) and an esds carrying the AudioSpecificConfig. moov goes
// before mdat so the file is playable from the first byte without a second
// range request.

export interface Mp4Input {
  /** Raw AAC access units, ADTS headers already stripped. */
  samples: Uint8Array[];
  /** Audio samples per access unit — 1024 for AAC-LC. */
  samplesPerFrame: number;
  sampleRate: number;
  channels: number;
  /** AudioSpecificConfig, as it goes into the esds DecoderSpecificInfo. */
  asc: Uint8Array;
}

const MOVIE_TIMESCALE = 1000;

function u32(v: number): Uint8Array {
  if (v < 0 || v > 0xffffffff) throw new Error(`u32 out of range: ${v}`);
  return Uint8Array.of((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}
const u16 = (v: number) => Uint8Array.of((v >>> 8) & 0xff, v & 0xff);
const u24 = (v: number) => Uint8Array.of((v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);

function cat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const fourcc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function box(type: string, ...body: Uint8Array[]): Uint8Array {
  const payload = cat(body);
  return cat([u32(payload.length + 8), fourcc(type), payload]);
}

function fullBox(type: string, version: number, flags: number, ...body: Uint8Array[]): Uint8Array {
  return box(type, Uint8Array.of(version), u24(flags), ...body);
}

/**
 * An MPEG-4 descriptor. The length is always written in the four-byte
 * continuation form so descriptor sizes never change width — the same reason
 * the WebM side pins its VINT widths.
 */
function descriptor(tag: number, ...body: Uint8Array[]): Uint8Array {
  const payload = cat(body);
  const len = payload.length;
  if (len > 0x0fffffff) throw new Error('descriptor too long');
  return cat([
    Uint8Array.of(tag),
    Uint8Array.of(
      0x80 | ((len >> 21) & 0x7f),
      0x80 | ((len >> 14) & 0x7f),
      0x80 | ((len >> 7) & 0x7f),
      len & 0x7f,
    ),
    payload,
  ]);
}

const UNITY_MATRIX = cat([
  u32(0x00010000), u32(0), u32(0),
  u32(0), u32(0x00010000), u32(0),
  u32(0), u32(0), u32(0x40000000),
]);

export function buildM4a(input: Mp4Input): { bytes: Uint8Array; durationMs: number } {
  const { samples, samplesPerFrame, sampleRate, channels, asc } = input;
  if (!samples.length) throw new Error('no audio samples');
  if (!sampleRate) throw new Error('no sample rate');

  const mediaDuration = samples.length * samplesPerFrame;
  const durationMs = Math.round((mediaDuration / sampleRate) * MOVIE_TIMESCALE);

  let mdatSize = 0;
  for (const s of samples) mdatSize += s.length;
  const avgBitrate = Math.round((mdatSize * 8) / (mediaDuration / sampleRate));
  let maxSample = 0;
  for (const s of samples) if (s.length > maxSample) maxSample = s.length;

  const esds = fullBox('esds', 0, 0,
    descriptor(0x03,
      u16(1),                      // ES_ID
      Uint8Array.of(0),            // no dependency, no URL, no OCR
      descriptor(0x04,
        Uint8Array.of(0x40),       // MPEG-4 Audio
        Uint8Array.of(0x15),       // AudioStream, not upstream
        u24(maxSample),
        u32(avgBitrate),
        u32(avgBitrate),
        descriptor(0x05, asc),
      ),
      descriptor(0x06, Uint8Array.of(0x02)),
    ),
  );

  // The 16.16 fixed-point sample rate field cannot hold anything above 65535,
  // which is fine for every rate Agora records at but must not pass silently.
  if (sampleRate > 0xffff) throw new Error(`sample rate ${sampleRate} does not fit stsd`);

  const mp4a = box('mp4a',
    new Uint8Array(6), u16(1),                    // reserved, data_reference_index
    u16(0), u16(0), u32(0),                       // version, revision, vendor
    u16(channels), u16(16),                       // channel count, sample size
    u16(0), u16(0),                               // pre_defined, reserved
    // 16.16 fixed point. Multiplication, not `<< 16`: JS bitwise operators are
    // 32-bit signed, and 44100 << 16 comes out negative.
    u32(sampleRate * 0x10000),
    esds,
  );

  const stbl = box('stbl',
    fullBox('stsd', 0, 0, u32(1), mp4a),
    fullBox('stts', 0, 0, u32(1), u32(samples.length), u32(samplesPerFrame)),
    // One chunk holding every sample: stco then needs a single offset, so the
    // sample table's size does not depend on where mdat lands.
    fullBox('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
    fullBox('stsz', 0, 0, u32(0), u32(samples.length), sampleSizeTable(samples)),
    fullBox('stco', 0, 0, u32(1), u32(0)),        // patched once the size is known
  );

  const moov = box('moov',
    fullBox('mvhd', 0, 0,
      u32(0), u32(0), u32(MOVIE_TIMESCALE), u32(durationMs),
      u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0),
      UNITY_MATRIX, new Uint8Array(24), u32(2),
    ),
    box('trak',
      fullBox('tkhd', 0, 0x000007,
        u32(0), u32(0), u32(1), u32(0), u32(durationMs),
        u32(0), u32(0), u16(0), u16(1), u16(0x0100), u16(0),
        UNITY_MATRIX, u32(0), u32(0),
      ),
      box('mdia',
        fullBox('mdhd', 0, 0, u32(0), u32(0), u32(sampleRate), u32(mediaDuration), u16(0x55c4), u16(0)),
        fullBox('hdlr', 0, 0, u32(0), fourcc('soun'), new Uint8Array(12), fourcc('SoundHandler\0')),
        box('minf',
          fullBox('smhd', 0, 0, u16(0), u16(0)),
          box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
          stbl,
        ),
      ),
    ),
  );

  const ftyp = box('ftyp', fourcc('M4A '), u32(0x200), fourcc('M4A '), fourcc('isom'), fourcc('iso2'), fourcc('mp41'));

  // mdat's payload starts 8 bytes into the box, after moov and ftyp.
  const mdatDataOffset = ftyp.length + moov.length + 8;
  if (mdatDataOffset + mdatSize > 0xffffffff) throw new Error('file too large for 32-bit offsets');

  // Patch the single stco entry now that the layout is fixed. The box is found
  // by walking the tree, never by scanning for the bytes "stco" — the stsz
  // table above it is arbitrary sample sizes, and one of them could spell it.
  const stco = findPath(moov, 8, moov.length, ['trak', 'mdia', 'minf', 'stbl', 'stco']);
  if (!stco) throw new Error('stco not found in moov');
  moov.set(u32(mdatDataOffset), stco.dataStart + 4 + 4); // version/flags + entry_count

  // Assembled by pushing, never by spreading: a half-hour recording is tens of
  // thousands of samples, and `...samples` overflows the call stack long before
  // it overflows anything else.
  const parts = [ftyp, moov, u32(mdatSize + 8), fourcc('mdat')];
  for (const s of samples) parts.push(s);
  return { bytes: cat(parts), durationMs };
}

/** The stsz entry table: one big-endian u32 per sample. */
function sampleSizeTable(samples: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(samples.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) view.setUint32(i * 4, samples[i].length);
  return out;
}

export interface BoxSpan { type: string; start: number; dataStart: number; end: number }

/** The boxes laid out directly between `from` and `to`. */
export function readBoxes(buf: Uint8Array, from: number, to: number): BoxSpan[] {
  const out: BoxSpan[] = [];
  let pos = from;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (pos + 8 <= to) {
    let size = view.getUint32(pos);
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
    let dataStart = pos + 8;
    if (size === 1) {
      // 64-bit largesize. Recordings never need it, but reading one wrong
      // would silently desynchronise the whole walk.
      const hi = view.getUint32(pos + 8);
      const lo = view.getUint32(pos + 12);
      size = hi * 0x100000000 + lo;
      dataStart = pos + 16;
    } else if (size === 0) {
      size = to - pos;
    }
    const end = pos + size;
    if (size < 8 || end > to) break;
    out.push({ type, start: pos, dataStart, end });
    pos = end;
  }
  return out;
}

/** Walk a chain of container boxes and return the box the path names. */
export function findPath(buf: Uint8Array, from: number, to: number, path: string[]): BoxSpan | null {
  let scope = { from, to };
  let found: BoxSpan | null = null;
  for (const want of path) {
    found = readBoxes(buf, scope.from, scope.to).find((b) => b.type === want) ?? null;
    if (!found) return null;
    scope = { from: found.dataStart, to: found.end };
  }
  return found;
}
