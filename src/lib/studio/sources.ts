/**
 * Extra sources a creator lays over the live picture: a logo or image, a
 * second camera, a video clip. Placement is kept as fractions of the frame so
 * it holds across a camera flip or a switch to a screen share.
 *
 * Images and camera choices are remembered per browser; a clip is a local
 * file and only lives for the session (a file handle cannot be stored).
 */
import type { FrameRect, SourceShape } from './program';

export type SourceKind = 'image' | 'camera' | 'video';

export interface SourceConfig {
  id: string;
  kind: SourceKind;
  name: string;
  rect: FrameRect;
  shape: SourceShape;
  visible: boolean;
  /** image: a data: URL. */
  image?: string;
  /** camera: the device to open. */
  deviceId?: string;
  mirror?: boolean;
  /** video: plays its sound into the stream. */
  withSound?: boolean;
  loop?: boolean;
  /** video: a hosted file instead of a picked one — a DeHub video the stream is reacting to. */
  url?: string;
  /** video: the DeHub post on screen, for the "Reacting to" chip and the original's credit. */
  reaction?: { tokenId: number; creator: string | null; title: string; linkId?: string };
}

export const MAX_SOURCES = 6;
export const MAX_IMAGE_BYTES = 1_500_000;

export type SourcePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export const SOURCE_POSITIONS: readonly SourcePosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];
export type SourceSize = 'small' | 'medium' | 'large';
export const SOURCE_SIZES: readonly SourceSize[] = ['small', 'medium', 'large'];

const SIZE_FRACTION: Record<SourceSize, number> = { small: 0.16, medium: 0.28, large: 0.5 };
const MARGIN = 0.025;

/**
 * A rect for a corner and size. Widths are a fraction of the frame width;
 * the height follows the source's own aspect so nothing is stretched, and the
 * frame's aspect converts it to a fraction of the frame height.
 */
export function placeSource(
  position: SourcePosition,
  size: SourceSize,
  sourceAspect: number,
  frameAspect = 16 / 9,
): FrameRect {
  const w = SIZE_FRACTION[size];
  const aspect = sourceAspect > 0 ? sourceAspect : 16 / 9;
  const h = Math.min(0.9, (w * frameAspect) / aspect);
  const mx = MARGIN;
  const my = MARGIN * frameAspect;
  switch (position) {
    case 'top-left':
      return { x: mx, y: my, w, h };
    case 'top-right':
      return { x: 1 - w - mx, y: my, w, h };
    case 'bottom-left':
      return { x: mx, y: 1 - h - my, w, h };
    case 'bottom-right':
      return { x: 1 - w - mx, y: 1 - h - my, w, h };
    default:
      return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }
}

/** The corner and size nearest to a rect, for showing the current choice. */
export function describeRect(rect: FrameRect): { position: SourcePosition; size: SourceSize } {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const centred = Math.abs(cx - 0.5) < 0.1 && Math.abs(cy - 0.5) < 0.1;
  const position: SourcePosition = centred
    ? 'center'
    : `${cy < 0.5 ? 'top' : 'bottom'}-${cx < 0.5 ? 'left' : 'right'}` as SourcePosition;
  const size = SOURCE_SIZES.reduce((best, s) =>
    Math.abs(SIZE_FRACTION[s] - rect.w) < Math.abs(SIZE_FRACTION[best] - rect.w) ? s : best,
  );
  return { position, size };
}

const STORAGE_KEY = 'dehub.studio.sources.v1';

/** Clips are not persisted: their file is gone after a reload. */
export function loadSourceConfigs(storage: Pick<Storage, 'getItem'> | null = safeStorage()): SourceConfig[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidConfig).filter((c) => c.kind !== 'video').slice(0, MAX_SOURCES);
  } catch {
    return [];
  }
}

export function saveSourceConfigs(configs: SourceConfig[], storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(configs.filter((c) => c.kind !== 'video')));
    return true;
  } catch {
    return false;
  }
}

function isValidConfig(c: unknown): c is SourceConfig {
  if (!c || typeof c !== 'object') return false;
  const s = c as SourceConfig;
  const r = s.rect;
  return (
    typeof s.id === 'string' &&
    (s.kind === 'image' || s.kind === 'camera' || s.kind === 'video') &&
    !!r &&
    [r.x, r.y, r.w, r.h].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    (s.kind !== 'image' || (typeof s.image === 'string' && s.image.startsWith('data:image/')))
  );
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function newSourceId(): string {
  return `src_${Math.random().toString(36).slice(2, 10)}`;
}

/** Reads a picked image as a data: URL, shrinking it if it is too big to remember. */
export async function readImageFile(file: File, maxBytes = MAX_IMAGE_BYTES, maxSide = 1280): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // PNG keeps a logo's transparency; a photo that comes out too big is
    // re-encoded as JPEG instead.
    let data = canvas.toDataURL('image/png');
    if (data.length * 0.75 > maxBytes) data = canvas.toDataURL('image/jpeg', 0.82);
    if (data.length * 0.75 > maxBytes) throw new Error('Image too large');
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}
