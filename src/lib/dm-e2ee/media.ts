/**
 * End-to-end encrypted DM attachments (photos, video, voice, files).
 *
 * Shared contract with dehub-mobile `libs/dm-e2ee/media.ts` — same reasoning
 * as crypto.ts: a file sealed on one platform is opened on the other, so every
 * constant here is wire format.
 *
 *   file key  = 32 random bytes, one per attachment
 *   blob      = "DHM1" | 16-byte nonce prefix | chunk 0 | chunk 1 | ...
 *   chunk i   = XChaCha20-Poly1305(fileKey, prefix || u64be(i),
 *                 aad = "dehub-dm-media-v1" | last?1:0) over ≤64 KiB
 *   message   = "dm-media:1:" + JSON(MediaDescriptor), sealed into the usual
 *               `e2e:` envelope with the conversation key. The server only
 *               ever sees the envelope and the ciphertext blob.
 *
 * Chunking keeps memory flat and lets a later version stream video; the
 * "last" flag in the AAD means a truncated blob fails to open instead of
 * playing a silently shortened file.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils';
import { fromBase64, toBase64 } from './crypto';

export const MEDIA_PREFIX = 'dm-media:1:';
const MAGIC = utf8ToBytes('DHM1');
const PREFIX_BYTES = 16;
const HEADER_BYTES = MAGIC.length + PREFIX_BYTES;
export const CHUNK_BYTES = 64 * 1024;
const TAG_BYTES = 16;
const AAD_BASE = utf8ToBytes('dehub-dm-media-v1');

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

/** What the recipient needs to fetch, open and lay out the attachment. */
export interface MediaDescriptor {
  /** base64 file key */
  k: string;
  kind: MediaKind;
  /** real MIME type of the plaintext */
  mime: string;
  /** plaintext size in bytes */
  size: number;
  name?: string;
  w?: number;
  h?: number;
  /** seconds (video / voice) */
  dur?: number;
  /** tiny JPEG data URL shown blurred until the real file opens */
  thumb?: string;
  /** voice waveform, 0..1 bars */
  wave?: number[];
  /** the caption the sender typed, if any */
  caption?: string;
}

function chunkNonce(prefix: Uint8Array, index: number): Uint8Array {
  const nonce = new Uint8Array(24);
  nonce.set(prefix, 0);
  // u64 big-endian counter; files are far below 2^53 chunks.
  let n = index;
  for (let i = 23; i >= 16; i--) {
    nonce[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return nonce;
}

function chunkAad(last: boolean): Uint8Array {
  const aad = new Uint8Array(AAD_BASE.length + 1);
  aad.set(AAD_BASE, 0);
  aad[AAD_BASE.length] = last ? 1 : 0;
  return aad;
}

export function newFileKey(): Uint8Array {
  return randomBytes(32);
}

/** Exact ciphertext size for a plaintext of `plainSize` bytes. */
export function encryptedSize(plainSize: number): number {
  const chunks = Math.max(1, Math.ceil(plainSize / CHUNK_BYTES));
  return HEADER_BYTES + plainSize + chunks * TAG_BYTES;
}

export function encryptMediaBytes(plain: Uint8Array, fileKey: Uint8Array): Uint8Array {
  const prefix = randomBytes(PREFIX_BYTES);
  const chunks = Math.max(1, Math.ceil(plain.length / CHUNK_BYTES));
  const out = new Uint8Array(encryptedSize(plain.length));
  out.set(MAGIC, 0);
  out.set(prefix, MAGIC.length);
  let w = HEADER_BYTES;
  for (let i = 0; i < chunks; i++) {
    const part = plain.subarray(i * CHUNK_BYTES, Math.min(plain.length, (i + 1) * CHUNK_BYTES));
    const ct = xchacha20poly1305(fileKey, chunkNonce(prefix, i), chunkAad(i === chunks - 1)).encrypt(part);
    out.set(ct, w);
    w += ct.length;
  }
  return out;
}

/** Throws on a wrong key, a tampered or a truncated blob. */
export function decryptMediaBytes(blob: Uint8Array, fileKey: Uint8Array): Uint8Array {
  if (blob.length < HEADER_BYTES + TAG_BYTES) throw new Error('Encrypted file too short');
  for (let i = 0; i < MAGIC.length; i++) {
    if (blob[i] !== MAGIC[i]) throw new Error('Not an encrypted DM file');
  }
  const prefix = blob.subarray(MAGIC.length, HEADER_BYTES);
  const body = blob.length - HEADER_BYTES;
  const sealedChunk = CHUNK_BYTES + TAG_BYTES;
  const chunks = Math.ceil(body / sealedChunk);
  const out = new Uint8Array(body - chunks * TAG_BYTES);
  let r = HEADER_BYTES;
  let w = 0;
  for (let i = 0; i < chunks; i++) {
    const end = Math.min(blob.length, r + sealedChunk);
    const pt = xchacha20poly1305(fileKey, chunkNonce(prefix, i), chunkAad(i === chunks - 1)).decrypt(
      blob.subarray(r, end),
    );
    out.set(pt, w);
    w += pt.length;
    r = end;
  }
  return out;
}

/** The plaintext that goes into the message envelope. */
export function encodeMediaDescriptor(d: MediaDescriptor): string {
  return MEDIA_PREFIX + JSON.stringify(d);
}

export function isMediaDescriptor(plaintext: string | null | undefined): boolean {
  return typeof plaintext === 'string' && plaintext.startsWith(MEDIA_PREFIX);
}

/** Null when the text is not a media descriptor or is malformed. */
export function decodeMediaDescriptor(plaintext: string | null | undefined): MediaDescriptor | null {
  if (!isMediaDescriptor(plaintext)) return null;
  try {
    const d = JSON.parse((plaintext as string).slice(MEDIA_PREFIX.length)) as MediaDescriptor;
    if (!d || typeof d.k !== 'string' || fromBase64(d.k).length !== 32) return null;
    if (!['image', 'video', 'audio', 'file'].includes(d.kind)) return null;
    return d;
  } catch {
    return null;
  }
}

export function fileKeyOf(d: MediaDescriptor): Uint8Array {
  return fromBase64(d.k);
}

export function fileKeyToString(key: Uint8Array): string {
  return toBase64(key);
}
