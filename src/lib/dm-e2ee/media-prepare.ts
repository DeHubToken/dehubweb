/**
 * Sender-side work for an encrypted DM attachment.
 *
 * The server only ever holds ciphertext, so it cannot resize a photo, pull a
 * poster frame out of a video or make a preview. The sending browser does
 * those here, before sealing: big photos come down to 2048px, and every
 * photo or video gets a tiny JPEG that travels inside the encrypted
 * descriptor and is shown blurred until the real file has opened.
 *
 * Everything degrades to "send the original, without a preview" — a format
 * the browser cannot decode (HEIC, say) still goes out encrypted.
 */
import type { MediaDescriptor, MediaKind } from './media';

const MAX_IMAGE_SIDE = 2048;
const IMAGE_QUALITY = 0.85;
const THUMB_MAX_CHARS = 1500;
const VIDEO_PROBE_TIMEOUT_MS = 8000;

/** Everything in the descriptor except the file key, plus the bytes to seal. */
export interface PreparedMedia {
  bytes: Uint8Array;
  descriptor: Omit<MediaDescriptor, 'k'>;
}

interface Drawable {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

function fit(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canvasOf(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function draw(img: Drawable, max: number): HTMLCanvasElement | null {
  const size = fit(img.width, img.height, max);
  const canvas = canvasOf(size.width, size.height);
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return null;
  // JPEG has no alpha; a transparent PNG would otherwise come out black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(img.source, 0, 0, size.width, size.height);
  return canvas;
}

/** A blurred-placeholder JPEG small enough to ride inside the message. */
function thumbnailOf(img: Drawable): string | undefined {
  for (const [side, quality] of [[32, 0.6], [28, 0.5], [24, 0.4]] as const) {
    try {
      const url = draw(img, side)?.toDataURL('image/jpeg', quality);
      if (url && url.startsWith('data:image/jpeg') && url.length <= THUMB_MAX_CHARS) return url;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function decodeImage(file: Blob): Promise<Drawable | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* fall through to <img> */ }
  }
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

async function prepareImage(file: File): Promise<PreparedMedia> {
  const mime = file.type || 'image/jpeg';
  const img = await decodeImage(file);
  if (!img) return { bytes: await bytesOf(file), descriptor: { kind: 'image', mime, size: file.size, name: file.name } };
  try {
    const thumb = thumbnailOf(img);
    // GIFs keep their animation; anything already within bounds keeps its
    // original bytes (and so its format and transparency).
    if (mime !== 'image/gif' && Math.max(img.width, img.height) > MAX_IMAGE_SIDE) {
      const canvas = draw(img, MAX_IMAGE_SIDE);
      const shrunk = canvas ? await canvasToBlob(canvas, 'image/jpeg', IMAGE_QUALITY) : null;
      if (canvas && shrunk && shrunk.size < file.size) {
        return {
          bytes: await bytesOf(shrunk),
          descriptor: {
            kind: 'image',
            mime: 'image/jpeg',
            size: shrunk.size,
            name: file.name.replace(/\.[^./]+$/, '') + '.jpg',
            w: canvas.width,
            h: canvas.height,
            ...(thumb ? { thumb } : {}),
          },
        };
      }
    }
    return {
      bytes: await bytesOf(file),
      descriptor: { kind: 'image', mime, size: file.size, name: file.name, w: img.width, h: img.height, ...(thumb ? { thumb } : {}) },
    };
  } finally {
    img.close?.();
  }
}

/** Poster frame, dimensions and duration, read from a throwaway <video>. */
async function probeVideo(file: File): Promise<{ w?: number; h?: number; dur?: number; thumb?: string }> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return {};
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), VIDEO_PROBE_TIMEOUT_MS);
      video.onloadeddata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('decode failed')); };
      video.src = url;
    });
    const dur = Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : undefined;
    const meta = { w: video.videoWidth || undefined, h: video.videoHeight || undefined, dur };
    // The very first frame is often black; a moment in reads better.
    const at = dur ? Math.min(0.5, dur / 2) : 0;
    if (at > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2000);
        video.onseeked = () => { clearTimeout(timer); resolve(); };
        video.currentTime = at;
      });
    }
    const thumb = video.videoWidth && video.videoHeight
      ? thumbnailOf({ source: video, width: video.videoWidth, height: video.videoHeight })
      : undefined;
    return { ...meta, ...(thumb ? { thumb } : {}) };
  } catch {
    return {};
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Which descriptor kind a picked file is sent as. */
export function mediaKindOf(file: File, msgType: 'media' | 'voice', isDocument: boolean): MediaKind {
  if (msgType === 'voice') return 'audio';
  if (isDocument) return 'file';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

export async function prepareMediaPlaintext(
  file: File,
  kind: MediaKind,
  opts: { voiceDuration?: number } = {},
): Promise<PreparedMedia> {
  if (kind === 'image') return prepareImage(file);
  if (kind === 'video') {
    const meta = await probeVideo(file);
    return { bytes: await bytesOf(file), descriptor: { kind, mime: file.type || 'video/mp4', size: file.size, name: file.name, ...meta } };
  }
  if (kind === 'audio') {
    return {
      bytes: await bytesOf(file),
      descriptor: {
        kind,
        mime: file.type || 'audio/webm',
        size: file.size,
        name: file.name,
        ...(opts.voiceDuration != null ? { dur: opts.voiceDuration } : {}),
      },
    };
  }
  return {
    bytes: await bytesOf(file),
    descriptor: { kind, mime: file.type || 'application/octet-stream', size: file.size, name: file.name },
  };
}
