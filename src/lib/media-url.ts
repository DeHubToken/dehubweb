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
 * Extract file extension from API path
 * Preserves original extension including .octet-stream, .gif, .jpeg, etc.
 */
export function getExtension(path: string): string {
  const match = path.match(/\.([a-zA-Z0-9-]+)$/);
  if (!match) return 'jpg';
  return match[1].toLowerCase();
}

/**
 * Build canonical avatar URL: cdn/avatars/{address}.{ext}
 * API may return paths like "avatars/xxx.jpg" or "statics/avatars/xxx.octet-stream"
 * We normalize to: https://dehubcdn.../avatars/{address}.{ext}
 */
export function buildAvatarUrl(address: string, apiAvatarPath: string | undefined | null): string | undefined {
  if (!apiAvatarPath) return undefined;
  if (apiAvatarPath.startsWith('http')) return apiAvatarPath;
  const ext = getExtension(apiAvatarPath);
  return `${DEHUB_CDN_BASE}avatars/${address}.${ext}`;
}

/**
 * Build canonical cover URL: cdn/covers/{address}.{ext}
 * API may return paths like "covers/xxx.jpg" or "statics/covers/xxx.gif"
 * We normalize to: https://dehubcdn.../covers/{address}.{ext}
 */
export function buildCoverUrl(address: string, apiCoverPath: string | undefined | null): string | undefined {
  if (!apiCoverPath) return undefined;
  if (apiCoverPath.startsWith('http')) return apiCoverPath;
  const ext = getExtension(apiCoverPath);
  return `${DEHUB_CDN_BASE}covers/${address}.${ext}`;
}

/**
 * Build canonical image URL: cdn/images/{tokenId}.{ext}
 * API returns paths like "images/2008.jpg" or "nfts/images/61.jpeg"
 * We normalize to: https://dehubcdn.../images/{tokenId}.{ext}
 */
export function buildImageUrl(tokenId: number | string, apiImagePath: string | undefined | null): string {
  if (!apiImagePath) return '';
  if (apiImagePath.startsWith('http')) return apiImagePath;
  const ext = getExtension(apiImagePath);
  return `${DEHUB_CDN_BASE}images/${tokenId}.${ext}`;
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
export function buildFeedImageUrls(apiImageUrls: string[] | undefined | null): string[] | undefined {
  if (!apiImageUrls || apiImageUrls.length === 0) return undefined;
  
  return apiImageUrls.map((imgUrl) => {
    if (imgUrl.startsWith('http')) return imgUrl;
    const filename = imgUrl.split('/').pop() || '';
    if (filename) {
      return `${DEHUB_CDN_BASE}feed-images/${filename}`;
    }
    return imgUrl;
  });
}
