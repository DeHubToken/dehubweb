// Minimal EBML/Matroska reader and writer — only what is needed to give a
// MediaRecorder WebM the Duration and Cues index it was never written with.
//
// Everything here works on whole-file Uint8Arrays. Stage recordings are tens of
// megabytes, which fits an edge function's memory an order of magnitude over.

export const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  Position: 0xa7,
  PrevSize: 0xab,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  SilentTracks: 0x5854,
  Void: 0xec,
  CRC32: 0xbf,
  Tags: 0x1254c367,
  Chapters: 0x1043a770,
  Attachments: 0x1941a469,
} as const;

/** Element IDs that may legally appear directly inside a Cluster. */
const CLUSTER_CHILDREN = new Set<number>([
  ID.Timecode, ID.Position, ID.PrevSize, ID.SimpleBlock, ID.BlockGroup,
  ID.SilentTracks, ID.Void, ID.CRC32,
]);

export class EbmlError extends Error {}

/**
 * Read an element ID. Unlike a size VINT, an ID keeps its length-marker bits —
 * the on-disk bytes *are* the ID, which is why they are written back verbatim.
 */
export function readId(b: Uint8Array, pos: number): { id: number; width: number } {
  if (pos >= b.length) throw new EbmlError(`readId past end at ${pos}`);
  const first = b[pos];
  if (first === 0) throw new EbmlError(`invalid element id at ${pos}`);
  let width = 1;
  for (let mask = 0x80; !(first & mask); mask >>= 1) width++;
  if (width > 4) throw new EbmlError(`element id ${width} bytes wide at ${pos}`);
  if (pos + width > b.length) throw new EbmlError(`truncated element id at ${pos}`);
  let id = 0;
  for (let i = 0; i < width; i++) id = id * 256 + b[pos + i];
  return { id, width };
}

/**
 * Read a size VINT. The length-marker bit is stripped, so an all-ones body
 * means "unknown size" — which is exactly what MediaRecorder writes for the
 * Segment and for every Cluster, and the reason this repair is needed at all.
 */
export function readSize(
  b: Uint8Array,
  pos: number,
): { size: number; width: number; unknown: boolean } {
  if (pos >= b.length) throw new EbmlError(`readSize past end at ${pos}`);
  const first = b[pos];
  if (first === 0) throw new EbmlError(`invalid size vint at ${pos}`);
  let width = 1;
  for (let mask = 0x80; !(first & mask); mask >>= 1) width++;
  if (pos + width > b.length) throw new EbmlError(`truncated size vint at ${pos}`);

  // "Unknown" has to be settled before the value is accumulated: an 8-byte
  // unknown size is 2^56-1, which is past Number.MAX_SAFE_INTEGER and would
  // trip the range check below on a perfectly valid element.
  let allOnes = (first & (0xff >> width)) === (0xff >> width);
  for (let i = 1; allOnes && i < width; i++) if (b[pos + i] !== 0xff) allOnes = false;
  if (allOnes) return { size: 0, width, unknown: true };

  let size = first & (0xff >> width);
  for (let i = 1; i < width; i++) size = size * 256 + b[pos + i];
  if (!Number.isSafeInteger(size)) throw new EbmlError(`size vint too large at ${pos}`);
  return { size, width, unknown: false };
}

/** Encode an element ID back to its on-disk bytes. */
export function writeId(id: number): Uint8Array {
  const bytes: number[] = [];
  let v = id;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  if (bytes.length === 0) throw new EbmlError('cannot encode element id 0');
  return Uint8Array.from(bytes);
}

/**
 * Encode a size as a VINT of exactly `width` bytes.
 *
 * Fixed width is the whole trick that makes this file writable in one pass.
 * Cues holds byte offsets of the clusters, and SeekHead holds the byte offset
 * of Cues — so a value that changes width would move everything it points at
 * and invalidate itself. Pinning every size and position to a fixed width makes
 * the layout independent of the values, so offsets can be computed once the
 * shape is known and written without a second convergence pass. Any width is
 * legal EBML; parsers read whatever width they are handed.
 */
export function writeSize(size: number, width = 8): Uint8Array {
  if (width < 1 || width > 8) throw new EbmlError(`bad vint width ${width}`);
  const out = new Uint8Array(width);
  let v = size;
  for (let i = width - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  if (v !== 0) throw new EbmlError(`size ${size} does not fit in ${width} bytes`);
  out[0] |= 0x80 >> (width - 1);
  return out;
}

/** An unsigned integer element body, big-endian, in exactly `width` bytes. */
export function uintBytes(value: number, width: number): Uint8Array {
  const out = new Uint8Array(width);
  let v = value;
  for (let i = width - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  if (v !== 0) throw new EbmlError(`uint ${value} does not fit in ${width} bytes`);
  return out;
}

/** Read an unsigned integer element body. */
export function readUint(b: Uint8Array, pos: number, len: number): number {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + b[pos + i];
  return v;
}

/** A complete element: id + fixed-width size + body. */
export function element(id: number, body: Uint8Array, sizeWidth = 8): Uint8Array {
  const idBytes = writeId(id);
  const sizeBytes = writeSize(body.length, sizeWidth);
  const out = new Uint8Array(idBytes.length + sizeBytes.length + body.length);
  out.set(idBytes, 0);
  out.set(sizeBytes, idBytes.length);
  out.set(body, idBytes.length + sizeBytes.length);
  return out;
}

export function concat(parts: Uint8Array[]): Uint8Array {
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

export interface RawElement {
  id: number;
  /** Offset of the element's first ID byte. */
  start: number;
  /** Offset of the element's body. */
  dataStart: number;
  /** Offset one past the element's body. */
  end: number;
  unknownSize: boolean;
}

/**
 * Find where an unknown-size Cluster ends: at the first ID that cannot be one
 * of its children. Clusters are the only unknown-size elements MediaRecorder
 * nests, so this does not need to recurse.
 */
function endOfUnknownSizeCluster(b: Uint8Array, dataStart: number): number {
  let pos = dataStart;
  while (pos < b.length) {
    let head;
    try {
      head = readId(b, pos);
    } catch {
      return pos;
    }
    if (!CLUSTER_CHILDREN.has(head.id)) return pos;
    const size = readSize(b, pos + head.width);
    if (size.unknown) throw new EbmlError(`unknown-size cluster child at ${pos}`);
    const next = pos + head.width + size.width + size.size;
    if (next <= pos || next > b.length) return b.length;
    pos = next;
  }
  return b.length;
}

/**
 * Walk the top-level children of a container, tolerating the unknown sizes
 * MediaRecorder emits.
 */
export function readChildren(b: Uint8Array, from: number, to: number): RawElement[] {
  const out: RawElement[] = [];
  let pos = from;
  while (pos < to) {
    const head = readId(b, pos);
    const size = readSize(b, pos + head.width);
    const dataStart = pos + head.width + size.width;
    let end: number;
    if (size.unknown) {
      // MediaRecorder streams, so it leaves two things open-ended: the Segment,
      // which is the last top-level element and therefore runs to EOF, and each
      // Cluster, which has to be found by scanning its children.
      if (head.id === ID.Segment) end = to;
      else if (head.id === ID.Cluster) end = endOfUnknownSizeCluster(b, dataStart);
      else throw new EbmlError(`unknown size on 0x${head.id.toString(16)}`);
    } else {
      end = dataStart + size.size;
    }
    if (end > to) end = to;
    out.push({ id: head.id, start: pos, dataStart, end, unknownSize: size.unknown });
    if (end <= pos) throw new EbmlError(`zero-length element at ${pos}`);
    pos = end;
  }
  return out;
}
