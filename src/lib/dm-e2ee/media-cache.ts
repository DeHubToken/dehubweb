/**
 * Opened encrypted DM attachments, as object URLs.
 *
 * An attachment is fetched from the CDN as ciphertext, opened with the key
 * from its descriptor and shown from a local blob. Opening is not free (a
 * download and a decrypt), so results are kept in a small in-memory LRU keyed
 * by the stored file's URL; an evicted entry's object URL is revoked. Nothing
 * opened is written to disk.
 *
 * The sender's own copy is seeded straight in, so a photo you just sent does
 * not download itself back.
 */
import { getMediaUrl } from '@/lib/api/dehub/core';
import { decryptMediaBytes, fileKeyOf, type MediaDescriptor } from './media';
import { translateCopy as _translateCopy } from '@/i18n/copy';

const MAX_ENTRIES = 60;
const MAX_BYTES = 200 * 1024 * 1024;

interface Entry {
  url: string;
  size: number;
}

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<string>>();
/** Plaintext of attachments this device just sent, until their stored URL is known. */
const seeds = new Map<string, Blob>();
let totalBytes = 0;

function revoke(url: string) {
  try { URL.revokeObjectURL(url); } catch { /* noop */ }
}

function evict() {
  while (entries.size > 1 && (entries.size > MAX_ENTRIES || totalBytes > MAX_BYTES)) {
    const [oldest, entry] = entries.entries().next().value as [string, Entry];
    entries.delete(oldest);
    totalBytes -= entry.size;
    revoke(entry.url);
  }
}

function put(key: string, blob: Blob): string {
  const existing = entries.get(key);
  if (existing) return touch(key, existing);
  const url = URL.createObjectURL(blob);
  entries.set(key, { url, size: blob.size });
  totalBytes += blob.size;
  evict();
  return url;
}

function touch(key: string, entry: Entry): string {
  entries.delete(key);
  entries.set(key, entry);
  return entry.url;
}

/** The opened object URL for this stored file, if it is cached. */
export function getCachedMedia(mediaUrl: string | undefined): string | undefined {
  if (!mediaUrl) return undefined;
  const entry = entries.get(mediaUrl);
  return entry ? touch(mediaUrl, entry) : undefined;
}

/** Remember the plaintext of an attachment this device just sent. */
export function seedSentMedia(messageId: string, plain: Blob) {
  seeds.set(messageId, plain);
  // Seeds only bridge the gap until the upload finishes; keep the map small.
  while (seeds.size > 20) seeds.delete(seeds.keys().next().value as string);
}

/** Object URL for a just-sent attachment whose stored URL is not known yet. */
export function getSeededMedia(messageId: string): string | undefined {
  const blob = seeds.get(messageId);
  return blob ? put(`seed:${messageId}`, blob) : undefined;
}

async function fetchAndOpen(mediaUrl: string, descriptor: MediaDescriptor): Promise<string> {
  // The raw object, never the image resizer: it cannot read ciphertext.
  const res = await fetch(getMediaUrl(mediaUrl) || mediaUrl);
  if (!res.ok) throw new Error(_translateCopy("copy.cda423573b70", { defaultValue: "Attachment download failed ({{value1}})", value1: res.status }));
  const blob = new Uint8Array(await res.arrayBuffer());
  const plain = decryptMediaBytes(blob, fileKeyOf(descriptor));
  return put(mediaUrl, new Blob([plain as BlobPart], { type: descriptor.mime || 'application/octet-stream' }));
}

/**
 * Open a stored encrypted attachment. Concurrent calls for the same file
 * share one download. Rejects on a network error, a wrong key or a damaged
 * file.
 */
export function loadDecryptedMedia(
  mediaUrl: string,
  descriptor: MediaDescriptor,
  messageId?: string,
): Promise<string> {
  const hit = getCachedMedia(mediaUrl);
  if (hit) return Promise.resolve(hit);
  const seeded = messageId ? seeds.get(messageId) : undefined;
  if (seeded) {
    seeds.delete(messageId!);
    return Promise.resolve(put(mediaUrl, seeded));
  }
  const pending = inflight.get(mediaUrl);
  if (pending) return pending;
  const job = fetchAndOpen(mediaUrl, descriptor).finally(() => inflight.delete(mediaUrl));
  inflight.set(mediaUrl, job);
  return job;
}

/** The opened bytes of a stored attachment, e.g. to re-upload it elsewhere. */
export async function loadDecryptedBlob(
  mediaUrl: string,
  descriptor: MediaDescriptor,
  messageId?: string,
): Promise<Blob> {
  const url = await loadDecryptedMedia(mediaUrl, descriptor, messageId);
  return (await fetch(url)).blob();
}

/** Drop everything (sign-out). */
export function clearDecryptedMedia() {
  for (const entry of entries.values()) revoke(entry.url);
  entries.clear();
  seeds.clear();
  inflight.clear();
  totalBytes = 0;
}
