/* Same logic as dehub-stream-backend src/common/util/mp4-metadata-scrub.ts. */
/**
 * Remove the metadata a phone writes into an MP4/MOV: GPS location
 * (`©xyz`, `com.apple.quicktime.location.ISO6709`), make, model, software
 * version, creation tags and any XMP packet.
 *
 * It works in place, without remuxing. Every `udta` / `meta` box in the movie
 * header (and each track header), plus any top-level XMP `uuid` box, is renamed
 * to `free` and its payload zeroed. `free` is a box every player skips, and
 * because no box changes size no chunk offset moves, so the audio and video
 * are byte-for-byte what was recorded.
 *
 * Re-encoding with ffmpeg does NOT do this: ffmpeg copies global metadata,
 * location included, to its output unless told not to.
 *
 * Anything that does not parse as an ISO box tree is returned unchanged.
 */

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf']);
const STRIP = new Set(['udta', 'meta']);
// Adobe XMP packet stored as a top-level uuid box.
const XMP_UUID = 'be7acfcb97a942e89c71999491e3afac';

const typeAt = (b: Uint8Array, at: number): string =>
  String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

const u32 = (b: Uint8Array, at: number): number =>
  ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];

const hexAt = (b: Uint8Array, at: number, len: number): string => {
  let out = '';
  for (let i = 0; i < len; i++) out += b[at + i].toString(16).padStart(2, '0');
  return out;
};

function blank(b: Uint8Array, start: number, headerLen: number, end: number): void {
  b[start + 4] = 0x66; // f
  b[start + 5] = 0x72; // r
  b[start + 6] = 0x65; // e
  b[start + 7] = 0x65; // e
  b.fill(0, start + headerLen, end);
}

function walk(b: Uint8Array, from: number, to: number, depth: number, topLevel: boolean): number {
  let removed = 0;
  let at = from;
  while (at + 8 <= to) {
    let size = u32(b, at);
    const type = typeAt(b, at + 4);
    let headerLen = 8;
    if (size === 1) {
      if (at + 16 > to) break;
      const hi = u32(b, at + 8);
      const lo = u32(b, at + 12);
      size = hi * 2 ** 32 + lo;
      headerLen = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < headerLen || at + size > to) break;
    const end = at + size;

    if (!topLevel && STRIP.has(type)) {
      blank(b, at, headerLen, end);
      removed++;
    } else if (topLevel && (STRIP.has(type) || (type === 'uuid' && end - at >= headerLen + 16 && hexAt(b, at + headerLen, 16) === XMP_UUID))) {
      blank(b, at, headerLen, end);
      removed++;
    } else if (CONTAINERS.has(type) && depth < 6) {
      removed += walk(b, at + headerLen, end, depth + 1, false);
    }
    at = end;
  }
  return removed;
}

/** True when the bytes start like an ISO base media file (MP4, MOV, M4A, 3GP). */
export function looksLikeIsoMedia(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const t = typeAt(b, 4);
  return t === 'ftyp' || t === 'moov' || t === 'wide' || t === 'mdat' || t === 'free' || t === 'skip';
}

/**
 * Scrub metadata from an MP4/MOV in place and return how many boxes were
 * blanked. Non-MP4 input is left alone and returns 0.
 */
export function scrubMp4MetadataInPlace(b: Uint8Array): number {
  if (!looksLikeIsoMedia(b)) return 0;
  try {
    return walk(b, 0, b.length, 0, true);
  } catch {
    return 0;
  }
}

/** Copying variant: returns scrubbed bytes, original untouched. */
export function scrubMp4Metadata<T extends Uint8Array>(input: T): T {
  if (!looksLikeIsoMedia(input)) return input;
  const copy = new Uint8Array(input) as T;
  scrubMp4MetadataInPlace(copy);
  return copy;
}

/**
 * Drop the EXIF (APP1, which also holds XMP) and IPTC/Photoshop (APP13)
 * segments from a JPEG: GPS, camera make and model, serial numbers, capture
 * time. Pixels and colour profile (APP2) are untouched. Anything that is not
 * a well-formed JPEG comes back unchanged.
 */
export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  const b = input;
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return input;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let at = 2;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) return input;
    const marker = b[at + 1];
    if (marker === 0xda) {
      // Start of scan: the rest is image data.
      parts.push(b.subarray(at));
      break;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.subarray(at, at + 2));
      at += 2;
      continue;
    }
    const len = (b[at + 2] << 8) + b[at + 3];
    if (len < 2 || at + 2 + len > b.length) return input;
    const drop = marker === 0xe1 || marker === 0xed;
    if (!drop) parts.push(b.subarray(at, at + 2 + len));
    at += 2 + len;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
