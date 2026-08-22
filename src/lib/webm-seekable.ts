/**
 * Make a MediaRecorder WebM seekable.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * `MediaRecorder` muxes for streaming, not for filing: the Segment and every
 * Cluster get an "unknown size" header, the `Info` element carries no
 * `Duration`, and there is no `Cues` index. Measured on the 2026-08-19 Town
 * Hall recording — 21 MB, 25m56s — `ffprobe` answers `duration=N/A`.
 *
 * Browsers paper over that by bisecting clusters, which is why the web scrub
 * bar works and the problem stayed invisible. media3/ExoPlayer does not: with
 * no `Cues` reachable before the first cluster it emits `SeekMap.Unseekable`,
 * and with no `Duration` the duration is `C.TIME_UNSET`. expo-audio therefore
 * reports `duration: 0` and silently drops every `seekTo` — the whole reason
 * the mobile Recorded list showed `0:00 / 0:00` behind a dead slider.
 *
 * Changing the recorder's mimeType does not help. `audio/mp4` out of
 * MediaRecorder is fragmented MP4 with no `sidx`, which ExoPlayer also treats
 * as unseekable. Only post-processing fixes it, and doing it here — in the
 * browser, on the way to the bucket — is the one place that needs no backend,
 * no re-encode and no format change, so nothing downstream (Safari playback,
 * the transcriber, the stored path and mime) moves at all.
 *
 * ── What it writes ──────────────────────────────────────────────────────────
 *
 *   EBML header          copied byte for byte
 *   Segment              header copied (its unknown size is kept, see below)
 *     SeekHead           NEW — the pointer to Cues, and the part that matters
 *     Info               copied, with a NEW Duration element
 *     Tracks             copied byte for byte
 *     Cluster…           copied byte for byte, as a Blob slice
 *     Cues               NEW — one CuePoint per cluster
 *
 * The `SeekHead` is not optional decoration. ExoPlayer decides seekability the
 * moment it meets the first Cluster: without a Cues pointer already in hand it
 * gives up there and then and never looks at the end of the file. Cues alone,
 * appended after the clusters, would change nothing.
 *
 * The Segment size is left unknown on purpose. It is what the recorder wrote,
 * every player already reads it, and it is what lets a *concatenated* file
 * survive this pass intact: switching voice effects mid-stage pushes a second
 * self-contained WebM stream into the same chunk array, and an implicitly
 * ended Segment keeps that tail exactly where it was rather than swallowing
 * it into a size we would have to invent.
 *
 * ── What it costs ───────────────────────────────────────────────────────────
 *
 * The cluster payload is never read into JavaScript. Cues are built by walking
 * element headers through a 4 MiB sliding window, and the output Blob is
 * assembled from a *slice* of the input, so peak JS memory is the window plus
 * ~18 bytes per cue point (~27 KB for the 26-minute Town Hall) regardless of
 * how long the stage ran.
 *
 * ── The rule it follows ─────────────────────────────────────────────────────
 *
 * Anything unrecognised means the original blob is returned untouched. This
 * runs on the only copy of a recording that will ever exist, after the host
 * has already ended the stage; a file we half understand is a file we do not
 * rewrite.
 */

/** Result of a finalisation attempt. `blob` is always safe to upload. */
export interface WebmSeekableResult {
  /** The finalised file, or the input unchanged when `changed` is false. */
  blob: Blob;
  /** True when a Duration and a Cues index were written. */
  changed: boolean;
  /** Why the input was left alone. Only set when `changed` is false. */
  reason?: string;
  /** Duration written, in milliseconds. */
  durationMs?: number;
  /** Number of CuePoints written. */
  cuePoints?: number;
}

// ─── Element IDs, as they appear on the wire (marker bits included) ─────────

const ID_EBML = 0x1a45dfa3;
const ID_SEGMENT = 0x18538067;
const ID_SEEK_HEAD = 0x114d9b74;
const ID_SEEK = 0x4dbb;
const ID_SEEK_ID = 0x53ab;
const ID_SEEK_POSITION = 0x53ac;
const ID_INFO = 0x1549a966;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;
const ID_TRACKS = 0x1654ae6b;
const ID_TRACK_ENTRY = 0xae;
const ID_TRACK_NUMBER = 0xd7;
const ID_CLUSTER = 0x1f43b675;
const ID_TIMECODE = 0xe7;
const ID_SIMPLE_BLOCK = 0xa3;
const ID_BLOCK_GROUP = 0xa0;
const ID_POSITION = 0xa7;
const ID_PREV_SIZE = 0xab;
const ID_ENCRYPTED_BLOCK = 0xaf;
const ID_SILENT_TRACKS = 0x5854;
const ID_CUES = 0x1c53bb6b;
const ID_CUE_POINT = 0xbb;
const ID_CUE_TIME = 0xb3;
const ID_CUE_TRACK_POSITIONS = 0xb7;
const ID_CUE_TRACK = 0xf7;
const ID_CUE_CLUSTER_POSITION = 0xf1;
const ID_TAGS = 0x1254c367;
const ID_CHAPTERS = 0x1043a770;
const ID_ATTACHMENTS = 0x1941a469;
const ID_VOID = 0xec;
const ID_CRC32 = 0xbf;

/** Everything that legally ends an unknown-size Cluster by starting after it. */
const LEVEL1_IDS = new Set([
  ID_SEEK_HEAD, ID_INFO, ID_TRACKS, ID_CLUSTER, ID_CUES,
  ID_TAGS, ID_CHAPTERS, ID_ATTACHMENTS,
]);

/** Everything a Cluster is allowed to contain. Anything else and we stop. */
const CLUSTER_CHILD_IDS = new Set([
  ID_TIMECODE, ID_SIMPLE_BLOCK, ID_BLOCK_GROUP, ID_POSITION, ID_PREV_SIZE,
  ID_ENCRYPTED_BLOCK, ID_SILENT_TRACKS, ID_CRC32, ID_VOID,
]);

/** Matroska's default when Info carries no TimecodeScale: 1 ms per tick. */
const DEFAULT_TIMECODE_SCALE = 1_000_000;

/** Sliding read window. Big enough that a 2-hour stage is ~25 slices. */
const WINDOW_BYTES = 4 * 1024 * 1024;

/** Longest legal element header: a 4-byte ID plus an 8-byte size. */
const MAX_HEADER_BYTES = 12;

// ─── Reading ───────────────────────────────────────────────────────────────

/**
 * Forward-only windowed reader over a Blob.
 *
 * The scan only ever moves forward, so a window that is simply reloaded from
 * the cursor whenever the request falls outside it is both correct and about
 * as cheap as this gets — the alternative is holding the whole recording in
 * memory, which for a two-hour stage is ~100 MB of ArrayBuffer we do not need.
 */
class BlobCursor {
  blob: Blob;
  private buf: Uint8Array = new Uint8Array(0);
  private base = 0;

  constructor(blob: Blob) {
    this.blob = blob;
  }

  get size(): number {
    return this.blob.size;
  }

  /** Up to `want` bytes at `pos`, short only at EOF. Null past the end. */
  async peek(pos: number, want: number): Promise<Uint8Array | null> {
    if (pos < 0 || pos >= this.blob.size) return null;
    const avail = Math.min(want, this.blob.size - pos);
    const offset = pos - this.base;
    if (offset >= 0 && offset + avail <= this.buf.length) {
      return this.buf.subarray(offset, offset + avail);
    }
    const end = Math.min(this.blob.size, pos + Math.max(WINDOW_BYTES, want));
    this.buf = new Uint8Array(await this.blob.slice(pos, end).arrayBuffer());
    this.base = pos;
    if (this.buf.length < avail) return null;
    return this.buf.subarray(0, avail);
  }
}

interface Vint {
  value: number;
  length: number;
  /** All value bits set — EBML's "size unknown" encoding. */
  unknown: boolean;
}

/**
 * Read one EBML variable-length integer.
 *
 * `stripMarker` is the difference between a size (marker bits removed) and an
 * element ID (marker bits are part of the identity and must be kept).
 */
function readVint(buf: Uint8Array, pos: number, stripMarker: boolean): Vint | null {
  const first = buf[pos];
  if (first === undefined || first === 0) return null; // 0 => length > 8
  let length = 1;
  let mask = 0x80;
  while ((first & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (pos + length > buf.length) return null;
  const valueMask = 0xff >> length;
  let value = stripMarker ? first & valueMask : first;
  let unknown = (first & valueMask) === valueMask;
  for (let i = 1; i < length; i++) {
    const byte = buf[pos + i];
    value = value * 256 + byte;
    if (byte !== 0xff) unknown = false;
  }
  return { value, length, unknown };
}

interface ElementHeader {
  id: number;
  size: number;
  /** True when the size is EBML's unknown marker. */
  unknown: boolean;
  /** Bytes occupied by the ID and size together. */
  headerLength: number;
}

async function readHeader(cur: BlobCursor, pos: number): Promise<ElementHeader | null> {
  const buf = await cur.peek(pos, MAX_HEADER_BYTES);
  if (!buf) return null;
  const id = readVint(buf, 0, false);
  if (!id || id.length > 4) return null;
  const size = readVint(buf, id.length, true);
  if (!size) return null;
  return {
    id: id.value,
    size: size.unknown ? 0 : size.value,
    unknown: size.unknown,
    headerLength: id.length + size.length,
  };
}

/** Big-endian unsigned integer of `length` bytes. */
function readUint(buf: Uint8Array, pos: number, length: number): number {
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + buf[pos + i];
  return value;
}

// ─── Writing ───────────────────────────────────────────────────────────────

/** An element ID back to its wire bytes. */
function idBytes(id: number): Uint8Array {
  const out: number[] = [];
  let v = id;
  while (v > 0) {
    out.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(out);
}

/** Minimal big-endian unsigned integer, padded out to `minLength` bytes. */
function uintBytes(value: number, minLength = 1): Uint8Array {
  let length = 1;
  while (length < 8 && value >= Math.pow(2, 8 * length)) length++;
  if (length < minLength) length = minLength;
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

/** An element size as a VINT, in the fewest bytes that will hold it. */
function sizeBytes(value: number): Uint8Array {
  let length = 1;
  while (length < 8 && value >= Math.pow(2, 7 * length) - 1) length++;
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i > 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] = v | (0x80 >> (length - 1));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A complete element: ID, size, payload. */
function element(id: number, payload: Uint8Array): Uint8Array {
  return concat([idBytes(id), sizeBytes(payload.length), payload]);
}

function uintElement(id: number, value: number, minLength = 1): Uint8Array {
  return element(id, uintBytes(value, minLength));
}

function floatElement(id: number, value: number): Uint8Array {
  const payload = new Uint8Array(8);
  new DataView(payload.buffer).setFloat64(0, value, false);
  return element(id, payload);
}

// ─── The pass itself ───────────────────────────────────────────────────────

interface ClusterEntry {
  /**
   * Offset from the start of the *cluster region*, not from the Segment.
   *
   * Inserting a SeekHead and a Duration pushes every cluster further into the
   * file, so an offset measured against the old Segment is wrong by exactly
   * the amount the head grew. Keeping it region-relative means the shift is
   * applied once, when the new layout is known.
   */
  position: number;
  /** Cluster Timecode, in TimecodeScale ticks. */
  timecode: number;
}

function untouched(blob: Blob, reason: string): WebmSeekableResult {
  return { blob, changed: false, reason };
}

/**
 * Rewrite a MediaRecorder WebM so that it declares its duration and carries a
 * Cues index reachable from a SeekHead.
 *
 * Never throws and never returns a blob it does not fully understand: on any
 * surprise the input is handed straight back, so the caller can upload the
 * result unconditionally.
 */
export async function makeWebmSeekable(input: Blob): Promise<WebmSeekableResult> {
  try {
    return await finalise(input);
  } catch (err) {
    return untouched(input, err instanceof Error ? err.message : 'unexpected error');
  }
}

async function finalise(input: Blob): Promise<WebmSeekableResult> {
  const cur = new BlobCursor(input);

  // ── EBML header ──────────────────────────────────────────────────────────
  const ebml = await readHeader(cur, 0);
  if (!ebml || ebml.id !== ID_EBML || ebml.unknown) return untouched(input, 'not an EBML file');
  const ebmlEnd = ebml.headerLength + ebml.size;
  const ebmlBytes = await cur.peek(0, ebmlEnd);
  if (!ebmlBytes || ebmlBytes.length !== ebmlEnd) return untouched(input, 'truncated EBML header');
  const ebmlHeader = ebmlBytes.slice();

  // ── Segment ──────────────────────────────────────────────────────────────
  const segment = await readHeader(cur, ebmlEnd);
  if (!segment || segment.id !== ID_SEGMENT) return untouched(input, 'no Segment');
  const segmentContentStart = ebmlEnd + segment.headerLength;
  const segmentEnd = segment.unknown ? input.size : segmentContentStart + segment.size;
  if (segmentEnd > input.size) return untouched(input, 'truncated Segment');

  // ── Level 1, up to the first Cluster ─────────────────────────────────────
  //
  // Chrome writes Info then Tracks and nothing else. Everything here is about
  // the day that stops being true.
  let infoBytes: Uint8Array | null = null;
  let tracksBytes: Uint8Array | null = null;
  const extraBytes: Uint8Array[] = [];
  let pos = segmentContentStart;

  for (;;) {
    const el = await readHeader(cur, pos);
    if (!el) return untouched(input, 'no clusters');
    if (el.id === ID_CLUSTER) break;
    if (el.unknown) return untouched(input, 'unknown-size element before the clusters');
    const total = el.headerLength + el.size;
    if (pos + total > segmentEnd) return untouched(input, 'element runs past the Segment');

    if (el.id === ID_CUES) {
      // Already indexed. Anything we did from here would be guesswork about
      // whose index is right.
      return untouched(input, 'already has a Cues index');
    }
    if (el.id === ID_INFO || el.id === ID_TRACKS || el.id === ID_TAGS ||
        el.id === ID_CHAPTERS || el.id === ID_ATTACHMENTS) {
      const bytes = await cur.peek(pos, total);
      if (!bytes || bytes.length !== total) return untouched(input, 'truncated element');
      if (el.id === ID_INFO) infoBytes = bytes.slice();
      else if (el.id === ID_TRACKS) tracksBytes = bytes.slice();
      else extraBytes.push(bytes.slice());
    } else if (el.id !== ID_SEEK_HEAD && el.id !== ID_VOID && el.id !== ID_CRC32) {
      // A SeekHead is dropped because we write our own; Void and CRC-32
      // because both are invalidated by moving the bytes underneath them.
      return untouched(input, `unexpected element 0x${el.id.toString(16)} before the clusters`);
    }
    pos += total;
  }

  if (!infoBytes) return untouched(input, 'no Info');
  if (!tracksBytes) return untouched(input, 'no Tracks');

  const clusterRegionStart = pos;

  // ── Walk the clusters ────────────────────────────────────────────────────
  const clusters: ClusterEntry[] = [];
  let lastClusterStart = -1;

  while (pos < segmentEnd) {
    const el = await readHeader(cur, pos);
    if (!el) break;
    if (el.id !== ID_CLUSTER) break; // Cues, Tags, or a second concatenated stream.

    const contentStart = pos + el.headerLength;
    let timecode: number | null = null;
    let end: number;

    if (el.unknown) {
      // Ends where something that is not a Cluster child begins.
      let q = contentStart;
      while (q < segmentEnd) {
        const child = await readHeader(cur, q);
        if (!child) {
          q = segmentEnd;
          break;
        }
        if (LEVEL1_IDS.has(child.id) || child.id === ID_EBML || child.id === ID_SEGMENT) break;
        if (!CLUSTER_CHILD_IDS.has(child.id)) {
          return untouched(input, `unexpected cluster child 0x${child.id.toString(16)}`);
        }
        if (child.unknown) return untouched(input, 'unknown-size cluster child');
        if (child.id === ID_TIMECODE && timecode === null) {
          const bytes = await cur.peek(q + child.headerLength, child.size);
          if (!bytes || bytes.length !== child.size) return untouched(input, 'truncated Timecode');
          timecode = readUint(bytes, 0, child.size);
        }
        q += child.headerLength + child.size;
        if (q > segmentEnd) return untouched(input, 'cluster runs past the Segment');
      }
      end = q;
    } else {
      end = contentStart + el.size;
      if (end > segmentEnd) return untouched(input, 'cluster runs past the Segment');
      const first = await readHeader(cur, contentStart);
      if (first && first.id === ID_TIMECODE && !first.unknown) {
        const bytes = await cur.peek(contentStart + first.headerLength, first.size);
        if (bytes && bytes.length === first.size) timecode = readUint(bytes, 0, first.size);
      }
    }

    if (timecode === null) return untouched(input, 'cluster with no Timecode');
    clusters.push({ position: pos - clusterRegionStart, timecode });
    lastClusterStart = pos;
    if (end <= pos) return untouched(input, 'zero-length cluster');
    pos = end;
  }

  if (clusters.length === 0) return untouched(input, 'no clusters');

  // A Cues index normally sits *after* the clusters, so the scan above cannot
  // see it and a file we have already finalised would be finalised again —
  // gaining a second, stale index. Whatever ends the cluster region decides:
  // Cues means indexed and done, an EBML header means a concatenated second
  // stream and there is still work to do.
  const afterClusters = await readHeader(cur, pos);
  if (afterClusters && afterClusters.id === ID_CUES) {
    return untouched(input, 'already has a Cues index');
  }

  const clusterRegionEnd = pos;

  // ── Duration ─────────────────────────────────────────────────────────────
  const timecodeScale = readTimecodeScale(infoBytes) ?? DEFAULT_TIMECODE_SCALE;
  const lastCluster = clusters[clusters.length - 1];
  const tailTicks = await measureLastClusterSpan(
    cur, lastClusterStart, clusterRegionEnd, clusters,
  );
  const durationTicks = lastCluster.timecode + tailTicks;
  if (!(durationTicks > 0) || !Number.isFinite(durationTicks)) {
    return untouched(input, 'could not derive a duration');
  }

  // ── Rebuild the head of the Segment ──────────────────────────────────────
  const newInfo = rebuildInfo(infoBytes, durationTicks);

  // SeekPositions are written at a fixed 8 bytes so the SeekHead's own length
  // does not depend on the offsets it contains — otherwise sizing it means
  // solving for a fixed point.
  const seekHead = (positions: { info: number; tracks: number; cues: number }) =>
    element(ID_SEEK_HEAD, concat([
      seekEntry(ID_INFO, positions.info),
      seekEntry(ID_TRACKS, positions.tracks),
      seekEntry(ID_CUES, positions.cues),
    ]));

  const seekHeadLength = seekHead({ info: 0, tracks: 0, cues: 0 }).length;
  const infoPosition = seekHeadLength;
  const tracksPosition = infoPosition + newInfo.length;
  let extrasLength = 0;
  for (const e of extraBytes) extrasLength += e.length;
  const clustersPosition = tracksPosition + tracksBytes.length + extrasLength;
  const cuesPosition = clustersPosition + (clusterRegionEnd - clusterRegionStart);

  // Only now is the shift known, so this is the first point at which a cue can
  // name a byte offset that will still be a Cluster in the file we write.
  const cues = buildCues(clusters, readFirstTrackNumber(tracksBytes) ?? 1, clustersPosition);

  const head = seekHead({ info: infoPosition, tracks: tracksPosition, cues: cuesPosition });
  if (head.length !== seekHeadLength) return untouched(input, 'SeekHead sizing is unstable');

  const segmentContentLength = cuesPosition + cues.length;
  const segmentHeader = segment.unknown
    ? concat([idBytes(ID_SEGMENT), new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])])
    : concat([idBytes(ID_SEGMENT), sizeBytes(segmentContentLength)]);

  const parts: BlobPart[] = [
    concat([ebmlHeader, segmentHeader, head, newInfo, tracksBytes, ...extraBytes]),
    input.slice(clusterRegionStart, clusterRegionEnd),
    cues,
  ];
  // Whatever followed the clusters — a Tags block, or the second WebM stream a
  // mid-recording voice-effect switch appends — is carried through untouched.
  if (clusterRegionEnd < input.size) parts.push(input.slice(clusterRegionEnd));

  return {
    blob: new Blob(parts, { type: input.type || 'audio/webm' }),
    changed: true,
    durationMs: Math.round((durationTicks * timecodeScale) / 1_000_000),
    cuePoints: clusters.length,
  };
}

function seekEntry(targetId: number, position: number): Uint8Array {
  return element(ID_SEEK, concat([
    element(ID_SEEK_ID, idBytes(targetId)),
    uintElement(ID_SEEK_POSITION, position, 8),
  ]));
}

/** Iterate the children of a master element already held in memory. */
function* children(bytes: Uint8Array): Generator<{ id: number; start: number; end: number; contentStart: number }> {
  const outer = readVint(bytes, 0, false);
  if (!outer) return;
  const size = readVint(bytes, outer.length, true);
  if (!size) return;
  let pos = outer.length + size.length;
  const end = size.unknown ? bytes.length : Math.min(bytes.length, pos + size.value);
  while (pos < end) {
    const id = readVint(bytes, pos, false);
    if (!id) return;
    const len = readVint(bytes, pos + id.length, true);
    if (!len || len.unknown) return;
    const contentStart = pos + id.length + len.length;
    const next = contentStart + len.value;
    if (next > end) return;
    yield { id: id.value, start: pos, end: next, contentStart };
    pos = next;
  }
}

function readTimecodeScale(infoBytes: Uint8Array): number | null {
  for (const child of children(infoBytes)) {
    if (child.id === ID_TIMECODE_SCALE) {
      return readUint(infoBytes, child.contentStart, child.end - child.contentStart);
    }
  }
  return null;
}

function readFirstTrackNumber(tracksBytes: Uint8Array): number | null {
  for (const entry of children(tracksBytes)) {
    if (entry.id !== ID_TRACK_ENTRY) continue;
    for (const field of children(tracksBytes.subarray(entry.start, entry.end))) {
      if (field.id === ID_TRACK_NUMBER) {
        const at = entry.start + field.contentStart;
        return readUint(tracksBytes, at, field.end - field.contentStart);
      }
    }
  }
  return null;
}

/** Info as it was, minus any Duration, plus the one we derived. */
function rebuildInfo(infoBytes: Uint8Array, durationTicks: number): Uint8Array {
  const kept: Uint8Array[] = [];
  for (const child of children(infoBytes)) {
    if (child.id === ID_DURATION) continue;
    kept.push(infoBytes.slice(child.start, child.end));
  }
  kept.push(floatElement(ID_DURATION, durationTicks));
  return element(ID_INFO, concat(kept));
}

/**
 * One CuePoint per cluster.
 *
 * `clustersPosition` is where the cluster region lands in the *new* Segment;
 * CueClusterPosition is defined relative to the Segment's content, so every
 * region-relative offset is rebased through it.
 */
function buildCues(
  clusters: ClusterEntry[],
  trackNumber: number,
  clustersPosition: number,
): Uint8Array {
  const points: Uint8Array[] = [];
  for (const cluster of clusters) {
    points.push(element(ID_CUE_POINT, concat([
      uintElement(ID_CUE_TIME, cluster.timecode),
      element(ID_CUE_TRACK_POSITIONS, concat([
        uintElement(ID_CUE_TRACK, trackNumber),
        uintElement(ID_CUE_CLUSTER_POSITION, clustersPosition + cluster.position),
      ])),
    ])));
  }
  return element(ID_CUES, concat(points));
}

/**
 * How much audio sits inside the final cluster, in TimecodeScale ticks.
 *
 * Every cluster before it is bounded by the next one's timecode; the last one
 * is bounded by nothing, so its span has to come from the blocks themselves —
 * the furthest block offset plus one block's worth of audio. Getting this
 * wrong is not cosmetic: a duration shorter than the audio makes progress race
 * to 100% while the recording is still playing, which is the bug the web
 * player already carries a workaround for.
 */
async function measureLastClusterSpan(
  cur: BlobCursor,
  clusterStart: number,
  clusterEnd: number,
  clusters: ClusterEntry[],
): Promise<number> {
  const fallback = clusters.length > 1
    ? medianGap(clusters)
    : 0;

  const header = await readHeader(cur, clusterStart);
  if (!header) return fallback;

  let pos = clusterStart + header.headerLength;
  const offsets: number[] = [];

  while (pos < clusterEnd) {
    const child = await readHeader(cur, pos);
    if (!child || child.unknown) break;
    const contentStart = pos + child.headerLength;
    if (child.id === ID_SIMPLE_BLOCK) {
      const bytes = await cur.peek(contentStart, Math.min(child.size, MAX_HEADER_BYTES));
      if (bytes) {
        const track = readVint(bytes, 0, true);
        if (track && bytes.length >= track.length + 2) {
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
          offsets.push(view.getInt16(track.length, false));
        }
      }
    }
    pos = contentStart + child.size;
  }

  if (offsets.length === 0) return fallback;
  const furthest = Math.max(...offsets);
  // One frame beyond the last block. Opus out of MediaRecorder is 20 ms, but
  // measuring beats assuming: consecutive block offsets give the real figure.
  const sorted = offsets.slice().sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] > sorted[i - 1]) gaps.push(sorted[i] - sorted[i - 1]);
  }
  const frame = gaps.length > 0
    ? gaps.sort((a, b) => a - b)[gaps.length >> 1]
    : (fallback > 0 ? fallback : 20);
  return Math.max(0, furthest) + frame;
}

function medianGap(clusters: ClusterEntry[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < clusters.length; i++) {
    const gap = clusters[i].timecode - clusters[i - 1].timecode;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[gaps.length >> 1];
}
