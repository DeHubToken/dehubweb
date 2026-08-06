/**
 * Media URL Utilities
 * ====================
 * Canonical URL construction for DeHub CDN assets.
 * Strips folder prefixes (statics/, nfts/, etc.) and builds clean URLs.
 * 
 * @module lib/media-url
 */

import { DEHUB_CDN_BASE } from '@/lib/api/dehub';

/**
 * Extract avatar path from any API object.
 * Handles all known field variations: avatarImageUrl, avatarUrl, avatar_url, minterAvatarUrl
 * Use this as the single source of truth before calling buildAvatarUrl.
 */
export function extractAvatarPath(obj: Record<string, any> | null | undefined): string | undefined {
  if (!obj) return undefined;
  return obj.avatarImageUrl || obj.avatarUrl || obj.avatar_url || obj.minterAvatarUrl || obj.actorAvatar || undefined;
}

/**
 * Extract file extension from API path
 * Preserves original extension including .octet-stream, .gif, .jpeg, etc.
 */
export function getExtension(path: string): string {
  const match = path.match(/\.([a-zA-Z0-9-]+)$/);
  if (!match) return 'jpg';
  return match[1].toLowerCase();
}

/**
 * Get the cache-bust value for a given address.
 * After a profile image upload, we store an address-specific timestamp in localStorage.
 * This ensures the browser fetches the updated image immediately after upload
 * rather than serving the old cached version.
 *
 * Falls back to a 1-HOUR window bucket for addresses with no stored version.
 * The bucket is what lets other users pick up someone else's new avatar, but
 * every bucket roll forces the browser + CDN to re-download EVERY avatar in
 * view — the previous 5-minute bucket re-fetched all avatars 288×/day.
 *
 * Reads are memoized: this runs per-avatar per-feed-mapper call, and
 * synchronous localStorage.getItem in that hot path adds up.
 */
const FALLBACK_BUCKET_MS = 3_600_000;
const versionCache = new Map<string, string>();

function getProfileImageVersion(address: string): string {
  const fallback = () => String(Math.floor(Date.now() / FALLBACK_BUCKET_MS));
  if (typeof localStorage === 'undefined') return fallback();
  const key = address.toLowerCase();
  const cached = versionCache.get(key);
  if (cached !== undefined) return cached || fallback();
  const stored = localStorage.getItem(`profile_img_v_${key}`) ?? '';
  versionCache.set(key, stored);
  return stored || fallback();
}

// ── Cloudflare Image Transformations ────────────────────────────────────
//
// The DigitalOcean Spaces CDN serves originals and nothing else: no resizing,
// no format negotiation, no `Vary: Accept`. A signed-out load of dehub.io in
// Aug 2026 pulled 79 distinct CDN images totalling ~3.5 MB, with zero `srcset`
// and zero `<picture>` in the app — a 1630x1570 avatar arriving for a 32x32
// slot, a 170 KB feed JPEG for a 180px rail tile.
//
// Routing them through dehub.io's Cloudflare zone fixes both at once.
// Measured against production:
//
//   avatar   27,940 B -> 1,523 B AVIF @ w=64
//   feed img 170,931 B -> 7,835 B @ w=180 / 24,092 B @ w=360
//   no-AVIF browser: 29,916 B JPEG @ w=360 — `format=auto` degrades cleanly
//
// ABSOLUTE origin, not a relative /cdn-cgi/ path: `/cdn-cgi/image/` only
// exists on the Cloudflare edge, so a relative URL 404s every image on
// localhost and in `vite preview`. Pinning the origin keeps dev, preview and
// production on one code path.
//
// This is a live dependency on the zone's Transformations setting (Images ->
// Transformations, with the Spaces host allowed as a remote source). If it is
// ever switched off, these URLs 404 — they do NOT silently fall back to the
// original. That is the trade for not needing an upload-side migration, and
// it is why only our own CDN host is rewritten: anything else is left alone.
const IMAGE_TRANSFORM_ORIGIN = 'https://dehub.io';

// SVG has nothing to gain and animated GIF loses its animation unless
// `anim=true` is threaded through, so both are passed through untouched.
const NON_TRANSFORMABLE = /\.(svg|gif)(\?|$)/i;

export interface CdnImageOptions {
  /** Target width in DEVICE pixels — i.e. CSS px x DPR, not CSS px. */
  width?: number;
  quality?: number;
  fit?: 'cover' | 'contain' | 'scale-down';
}

/**
 * Wrap a DeHub CDN URL in a Cloudflare image transform. Any URL that is not on
 * our CDN (dicebear, iHeart station art, blob:/data: previews) is returned
 * untouched.
 */
export function cdnImage(url: string, opts?: CdnImageOptions): string;
export function cdnImage(url: string | undefined, opts?: CdnImageOptions): string | undefined;
export function cdnImage(
  url: string | undefined,
  opts: CdnImageOptions = {},
): string | undefined {
  if (!url) return url;
  if (!url.startsWith(DEHUB_CDN_BASE)) return url;
  if (NON_TRANSFORMABLE.test(url)) return url;

  const params = [`format=auto`, `quality=${opts.quality ?? 80}`];
  if (opts.width) params.push(`width=${opts.width}`);
  if (opts.fit) params.push(`fit=${opts.fit}`);
  // `scale-down`-style behaviour is the default for width-only transforms:
  // Cloudflare never upscales past the source, so a small original stays small.
  return `${IMAGE_TRANSFORM_ORIGIN}/cdn-cgi/image/${params.join(',')}/${url}`;
}

// Defaults are DEVICE pixels sized for the largest place each kind renders, so
// no call site gets a softer image than it does today:
//   avatars — largest <Avatar> in the app is w-24 (96 CSS px) => 192 at 2x DPR
//   covers  — full-bleed profile banner
//   images / feed-images — full-width feed media on a desktop viewport
const DEFAULT_AVATAR_WIDTH = 192;
const DEFAULT_COVER_WIDTH = 1500;
const DEFAULT_IMAGE_WIDTH = 1080;

/**
 * Call this after a successful profile image upload to force a fresh CDN fetch
 * on the next render (even within the same fallback cache window).
 */
export function bumpProfileImageVersion(address: string): void {
  if (typeof localStorage !== 'undefined') {
    const key = address.toLowerCase();
    const stamp = String(Date.now());
    localStorage.setItem(`profile_img_v_${key}`, stamp);
    versionCache.set(key, stamp);
  }
}

/**
 * Build a direct CDN avatar URL: cdn/avatars/{address}.{ext}
 * Used as a cascading fallback when the primary API-server URL fails.
 *
 * Deliberately NOT routed through cdnImage(): this is the last rung of the
 * fallback ladder, so it must not share a failure mode with the primary URL.
 * If the zone's Transformations setting is ever switched off, every
 * cdnImage() URL 404s at once — and this path is what still resolves.
 */
export function buildAvatarCdnFallbackUrl(address: string, apiAvatarPath?: string | null, size?: number): string | undefined {
  if (!address) return undefined;
  const ext = apiAvatarPath ? getExtension(apiAvatarPath) : 'jpg';
  const cacheBust = getProfileImageVersion(address.toLowerCase());
  const sizeParam = size ? `&w=${size}&h=${size}` : '';
  return `${DEHUB_CDN_BASE}avatars/${address.toLowerCase()}.${ext}?v=${cacheBust}${sizeParam}`;
}

/**
 * Build canonical avatar URL: cdn/avatars/{address}.{ext}
 * API may return paths like "avatars/xxx.jpg" or "statics/avatars/xxx.octet-stream"
 * We normalize to: https://dehubcdn.../avatars/{address}.{ext}
 */
export function buildAvatarUrl(
  address: string,
  apiAvatarPath: string | undefined | null,
  /** Device pixels. Defaults to the largest avatar the app renders (w-24 @2x). */
  width: number = DEFAULT_AVATAR_WIDTH,
): string | undefined {
  return cdnImage(buildAvatarSourceUrl(address, apiAvatarPath), { width, fit: 'cover' });
}

/**
 * The canonical, untransformed avatar URL. Split out so buildAvatarUrl can wrap
 * it in one place instead of at each of the eight return paths below.
 */
function buildAvatarSourceUrl(address: string, apiAvatarPath: string | undefined | null): string | undefined {
  if (!apiAvatarPath) return undefined;

  // Blob or data URLs (optimistic previews) - return as-is
  if (apiAvatarPath.startsWith('blob:') || apiAvatarPath.startsWith('data:')) {
    return apiAvatarPath;
  }

  const normalizedAddress = address?.toLowerCase?.() || '';
  const cacheBust = normalizedAddress
    ? getProfileImageVersion(normalizedAddress)
    : String(Math.floor(Date.now() / 300000));

  // If it's already a dehubcdn URL, append cache-bust and return
  if (apiAvatarPath.startsWith('https://dehubcdn')) {
    return `${apiAvatarPath}${apiAvatarPath.includes('?') ? '&' : '?'}v=${cacheBust}`;
  }

  // api.dehub.io/statics/... — strip statics/ prefix and route to CDN
  // e.g. "https://api.dehub.io/statics/avatars/0x.png" → "https://dehubcdn.../avatars/0x.png"
  if (apiAvatarPath.includes('api.dehub.io') && apiAvatarPath.includes('/statics/')) {
    const match = apiAvatarPath.match(/statics\/([^?]+)/);
    if (match) {
      return `${DEHUB_CDN_BASE}${match[1]}?v=${cacheBust}`;
    }
  }

  // Any other api.dehub.io URL — extract path and route to CDN
  // api.dehub.io does NOT serve avatar files directly (returns 404); CDN is the source of truth
  if (apiAvatarPath.includes('api.dehub.io')) {
    const match = apiAvatarPath.match(/api\.dehub\.io\/([^?]+)/);
    if (match) {
      return `${DEHUB_CDN_BASE}${match[1]}?v=${cacheBust}`;
    }
  }

  // Other full URLs (dicebear, external CDNs, etc.) - return as-is
  if (apiAvatarPath.startsWith('http')) return apiAvatarPath;

  // "statics/" prefix — strip it and serve from CDN
  // e.g. "statics/avatars/0x.png" → "https://dehubcdn.../avatars/0x.png"
  if (apiAvatarPath.startsWith('statics/')) {
    const cdnPath = apiAvatarPath.slice('statics/'.length);
    return `${DEHUB_CDN_BASE}${cdnPath}?v=${cacheBust}`;
  }

  // For remaining relative paths, require a known address and a valid path (must contain /)
  if (!normalizedAddress) return undefined;
  if (!apiAvatarPath.includes('/')) return undefined;

  // Relative path (including avatars/) — use CDN base
  return `${DEHUB_CDN_BASE}${apiAvatarPath}${apiAvatarPath.includes('?') ? '&' : '?'}v=${cacheBust}`;
}

/**
 * Build canonical cover URL: cdn/covers/{address}.{ext}
 * API may return paths like "covers/xxx.jpg" or "statics/covers/xxx.gif"
 * We normalize to: https://dehubcdn.../covers/{address}.{ext}
 */
export function buildCoverUrl(
  address: string,
  apiCoverPath: string | undefined | null,
  width: number = DEFAULT_COVER_WIDTH,
): string | undefined {
  if (!apiCoverPath) return undefined;
  if (apiCoverPath.startsWith('blob:') || apiCoverPath.startsWith('data:')) return apiCoverPath;
  if (apiCoverPath.startsWith('http')) return cdnImage(apiCoverPath, { width });
  const ext = getExtension(apiCoverPath);
  const cacheBust = getProfileImageVersion(address);
  return cdnImage(`${DEHUB_CDN_BASE}covers/${address}.${ext}?v=${cacheBust}`, { width });
}

/**
 * Build canonical image URL: cdn/images/{tokenId}.{ext}
 * API returns paths like "images/2008.jpg" or "nfts/images/61.jpeg"
 * We normalize to: https://dehubcdn.../images/{tokenId}.{ext}
 */
export function buildImageUrl(
  tokenId: number | string,
  apiImagePath: string | undefined | null,
  width: number = DEFAULT_IMAGE_WIDTH,
): string {
  if (!apiImagePath) return '';
  if (apiImagePath.startsWith('http')) return cdnImage(apiImagePath, { width });
  // Shorts thumbnails live in their own CDN folder — keep the path as-is.
  // Rewriting them to images/{tokenId} 403s (the file was never uploaded there).
  if (apiImagePath.startsWith('shorts/')) return cdnImage(`${DEHUB_CDN_BASE}${apiImagePath}`, { width });
  const ext = getExtension(apiImagePath);
  return cdnImage(`${DEHUB_CDN_BASE}images/${tokenId}.${ext}`, { width });
}

/**
 * Build video URL: cdn/videos/{tokenId}.mp4
 */
export function buildVideoUrl(tokenId: number | string): string {
  return `${DEHUB_CDN_BASE}videos/${tokenId}.mp4`;
}

/**
 * Build multi-image URLs: cdn/feed-images/{filename}
 * API returns array like ["feed-images/abc.jpg", "feed-images/def.png"]
 * We extract filename and build: https://dehubcdn.../feed-images/{filename}
 */
export function buildFeedImageUrls(
  apiImageUrls: string[] | undefined | null,
  width: number = DEFAULT_IMAGE_WIDTH,
): string[] | undefined {
  if (!apiImageUrls || apiImageUrls.length === 0) return undefined;

  return apiImageUrls.map((imgUrl) => {
    if (imgUrl.startsWith('http')) return cdnImage(imgUrl, { width });
    const filename = imgUrl.split('/').pop() || '';
    if (filename) {
      return cdnImage(`${DEHUB_CDN_BASE}feed-images/${filename}`, { width });
    }
    return imgUrl;
  });
}
