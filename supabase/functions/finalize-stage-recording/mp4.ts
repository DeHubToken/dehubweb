// A minimal, audio-only MP4 muxer, for the two codecs stages record in.
//
// It writes exactly the boxes a player needs to seek: a sample table (stts /
// stsz / stsc / stco) and the codec's own config box — an esds carrying the
// AudioSpecificConfig for AAC, a dOps for Opus. moov goes before mdat so the
// file is playable from the first byte without a second range request.

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

  const mp4a = audioSampleEntry('mp4a', channels, sampleRate, esds);

  return assemble({
    ftyp: box('ftyp', fourcc('M4A '), u32(0x200), fourcc('M4A '), fourcc('isom'), fourcc('iso2'), fourcc('mp41')),
    timescale: sampleRate,
    mediaDuration,
    sampleEntry: mp4a,
    stts: fullBox('stts', 0, 0, u32(1), u32(samples.length), u32(samplesPerFrame)),
    samples,
  });
}

// ── Opus ────────────────────────────────────────────────────────────────────
//
// Laid out after "Encapsulation of Opus in ISO Base Media File Format" and
// checked box for box against what ffmpeg writes for `-c:a copy` out of a
// WebM: an 'Opus' sample entry carrying a dOps, a 48 kHz media timescale, a
// per-sample stts (packets are not all the same length), and a 'roll' sample
// group so a decoder that lands mid-stream pre-rolls the 80 ms Opus needs.

export interface OpusHead {
  channels: number;
  preSkip: number;
  inputSampleRate: number;
  /** Q7.8 dB, signed. */
  outputGain: number;
  mappingFamily: number;
  /** Only for mapping family != 0: stream count, coupled count, then one byte per channel. */
  mappingTable?: Uint8Array;
}

/** Read the OpusHead a WebM carries as CodecPrivate. Every field is little-endian. */
export function parseOpusHead(b: Uint8Array): OpusHead {
  const magic = String.fromCharCode(...b.subarray(0, 8));
  if (b.length < 19 || magic !== 'OpusHead') throw new Error('CodecPrivate is not an OpusHead');
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const channels = b[9];
  if (!channels) throw new Error('OpusHead has no channels');
  const mappingFamily = b[18];
  const head: OpusHead = {
    channels,
    preSkip: view.getUint16(10, true),
    inputSampleRate: view.getUint32(12, true),
    outputGain: view.getInt16(16, true),
    mappingFamily,
  };
  if (mappingFamily !== 0) {
    if (b.length < 21 + channels) throw new Error('OpusHead mapping table is truncated');
    head.mappingTable = b.slice(19, 21 + channels);
  }
  return head;
}

/** Opus is always decoded at 48 kHz, whatever the input rate was. */
export const OPUS_RATE = 48000;

/**
 * Samples (at 48 kHz) one Opus packet decodes to, from its TOC byte
 * (RFC 6716 §3.1). Chrome packs three 20 ms CELT frames into each 60 ms packet,
 * which is why the frame count matters as much as the configuration.
 * Returns 0 for a packet that cannot be valid.
 */
export function opusPacketSamples(p: Uint8Array): number {
  if (!p.length) return 0;
  const toc = p[0];
  const config = toc >> 3;
  let frame: number;
  if (config < 12) frame = [480, 960, 1920, 2880][config & 3];      // SILK 10/20/40/60 ms
  else if (config < 16) frame = [480, 960][config & 1];             // Hybrid 10/20 ms
  else frame = [120, 240, 480, 960][config & 3];                    // CELT 2.5/5/10/20 ms
  const code = toc & 3;
  let frames: number;
  if (code === 0) frames = 1;
  else if (code < 3) frames = 2;
  else {
    if (p.length < 2) return 0;
    frames = p[1] & 0x3f;
  }
  const total = frames * frame;
  // A packet can never decode to more than 120 ms.
  return total > 0 && total <= 5760 ? total : 0;
}

export interface OpusMp4Input {
  packets: Uint8Array[];
  /** Samples at 48 kHz per packet, in the same order. */
  durations: number[];
  head: OpusHead;
}

export function buildOpusMp4(input: OpusMp4Input): { bytes: Uint8Array; durationMs: number } {
  const { packets, durations, head } = input;
  if (!packets.length) throw new Error('no audio samples');
  if (durations.length !== packets.length) throw new Error('one duration per packet');

  let mediaDuration = 0;
  for (const d of durations) {
    if (!(d > 0)) throw new Error('a packet has no duration');
    mediaDuration += d;
  }

  let mdatSize = 0;
  let maxSample = 0;
  for (const p of packets) {
    mdatSize += p.length;
    if (p.length > maxSample) maxSample = p.length;
  }
  const avgBitrate = Math.round((mdatSize * 8) / (mediaDuration / OPUS_RATE));

  const dOps = box('dOps',
    Uint8Array.of(0, head.channels),              // Version, OutputChannelCount
    u16(head.preSkip),
    u32(head.inputSampleRate),
    u16(head.outputGain & 0xffff),
    Uint8Array.of(head.mappingFamily),
    ...(head.mappingFamily !== 0 && head.mappingTable ? [head.mappingTable] : []),
  );
  // bufferSizeDB, maxBitrate, avgBitrate. Max is taken over one second, the
  // window the field is defined against, so it stays an honest ceiling.
  const btrt = box('btrt', u32(maxSample), u32(maxBitrateOverOneSecond(packets, durations)), u32(avgBitrate));
  const opus = audioSampleEntry('Opus', head.channels, OPUS_RATE, dOps, btrt);

  // Pre-roll: enough whole packets to cover 80 ms, the way ffmpeg counts it.
  const typical = durations[Math.min(1, durations.length - 1)];
  const rollPackets = Math.max(1, Math.ceil(3840 / typical));
  const extra: Uint8Array[] = [
    fullBox('sgpd', 1, 0, fourcc('roll'), u32(2), u32(1), u16((-rollPackets) & 0xffff)),
    fullBox('sbgp', 0, 0, fourcc('roll'),
      ...(packets.length > rollPackets
        ? [u32(2), u32(rollPackets), u32(0), u32(packets.length - rollPackets), u32(1)]
        : [u32(1), u32(packets.length), u32(0)])),
  ];

  return assemble({
    ftyp: box('ftyp', fourcc('isom'), u32(0x200), fourcc('isom'), fourcc('iso2'), fourcc('mp41')),
    timescale: OPUS_RATE,
    mediaDuration,
    sampleEntry: opus,
    stts: runLengthStts(durations),
    samples: packets,
    extraStbl: extra,
    // ffmpeg writes a single whole-track edit; AVPlayer is the player this file
    // exists for, so the layout stays as close to that as the boxes allow.
    editList: true,
  });
}

function runLengthStts(durations: number[]): Uint8Array {
  const runs: Array<[number, number]> = [];
  for (const d of durations) {
    const last = runs[runs.length - 1];
    if (last && last[1] === d) last[0]++;
    else runs.push([1, d]);
  }
  const table = new Uint8Array(runs.length * 8);
  const view = new DataView(table.buffer);
  runs.forEach(([count, delta], i) => {
    view.setUint32(i * 8, count);
    view.setUint32(i * 8 + 4, delta);
  });
  return fullBox('stts', 0, 0, u32(runs.length), table);
}

function maxBitrateOverOneSecond(packets: Uint8Array[], durations: number[]): number {
  let best = 0;
  let windowBytes = 0;
  let windowSamples = 0;
  let tail = 0;
  for (let i = 0; i < packets.length; i++) {
    windowBytes += packets[i].length;
    windowSamples += durations[i];
    while (windowSamples > OPUS_RATE && tail < i) {
      windowBytes -= packets[tail].length;
      windowSamples -= durations[tail];
      tail++;
    }
    if (windowBytes * 8 > best) best = windowBytes * 8;
  }
  return best;
}

// ── Shared layout ───────────────────────────────────────────────────────────

function audioSampleEntry(type: string, channels: number, sampleRate: number, ...children: Uint8Array[]): Uint8Array {
  return box(type,
    new Uint8Array(6), u16(1),                    // reserved, data_reference_index
    u16(0), u16(0), u32(0),                       // version, revision, vendor
    u16(channels), u16(16),                       // channel count, sample size
    u16(0), u16(0),                               // pre_defined, reserved
    // 16.16 fixed point. Multiplication, not `<< 16`: JS bitwise operators are
    // 32-bit signed, and 44100 << 16 comes out negative.
    u32(sampleRate * 0x10000),
    ...children,
  );
}

interface Layout {
  ftyp: Uint8Array;
  /** The media timescale: the rate stts durations are counted in. */
  timescale: number;
  mediaDuration: number;
  sampleEntry: Uint8Array;
  stts: Uint8Array;
  samples: Uint8Array[];
  /** Boxes appended to stbl after the sample table (sample groups). */
  extraStbl?: Uint8Array[];
  editList?: boolean;
}

function assemble(l: Layout): { bytes: Uint8Array; durationMs: number } {
  const { samples } = l;
  const durationMs = Math.round((l.mediaDuration / l.timescale) * MOVIE_TIMESCALE);

  let mdatSize = 0;
  for (const s of samples) mdatSize += s.length;

  const stbl = box('stbl',
    fullBox('stsd', 0, 0, u32(1), l.sampleEntry),
    l.stts,
    // One chunk holding every sample: stco then needs a single offset, so the
    // sample table's size does not depend on where mdat lands.
    fullBox('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
    fullBox('stsz', 0, 0, u32(0), u32(samples.length), sampleSizeTable(samples)),
    fullBox('stco', 0, 0, u32(1), u32(0)),        // patched once the size is known
    ...(l.extraStbl ?? []),
  );

  const edts = l.editList
    ? [box('edts', fullBox('elst', 0, 0, u32(1), u32(durationMs), u32(0), u16(1), u16(0)))]
    : [];

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
      ...edts,
      box('mdia',
        fullBox('mdhd', 0, 0, u32(0), u32(0), u32(l.timescale), u32(l.mediaDuration), u16(0x55c4), u16(0)),
        fullBox('hdlr', 0, 0, u32(0), fourcc('soun'), new Uint8Array(12), fourcc('SoundHandler\0')),
        box('minf',
          fullBox('smhd', 0, 0, u16(0), u16(0)),
          box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
          stbl,
        ),
      ),
    ),
  );

  // mdat's payload starts 8 bytes into the box, after moov and ftyp.
  const mdatDataOffset = l.ftyp.length + moov.length + 8;
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
  const parts = [l.ftyp, moov, u32(mdatSize + 8), fourcc('mdat')];
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
