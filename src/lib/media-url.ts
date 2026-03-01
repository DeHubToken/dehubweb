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
 * Build canonical avatar URL: cdn/avatars/{address}.{ext}
 * API may return paths like "avatars/xxx.jpg" or "statics/avatars/xxx.octet-stream"
 * We normalize to: https://dehubcdn.../avatars/{address}.{ext}
 */
export function buildAvatarUrl(address: string, apiAvatarPath: string | undefined | null): string | undefined {
  if (!apiAvatarPath) return undefined;
  if (!address) return undefined;
  
  // Cache-bust param: 5-minute windows so browsers fetch latest avatars
  const cacheBust = Math.floor(Date.now() / 300000);
  
  // If it's already a dehubcdn URL, append cache-bust and return
  if (apiAvatarPath.startsWith('https://dehubcdn')) {
    return `${apiAvatarPath}${apiAvatarPath.includes('?') ? '&' : '?'}v=${cacheBust}`;
  }
  
  // If it's any api.dehub.io URL, extract the path portion and rebuild with CDN
  if (apiAvatarPath.includes('api.dehub.io')) {
    // Extract relative path after the domain (e.g. "avatars/0x9e19...jpg")
    const match = apiAvatarPath.match(/api\.dehub\.io\/(.+)/);
    if (match) {
      return `${DEHUB_CDN_BASE}${match[1]}${match[1].includes('?') ? '&' : '?'}v=${cacheBust}`;
    }
  }
  
  // Other full URLs (dicebear, external CDNs, etc.) - return as-is
  if (apiAvatarPath.startsWith('http')) return apiAvatarPath;
  
  // Relative path - preserve API path as-is (contains correct address in filename)
  return `${DEHUB_CDN_BASE}${apiAvatarPath}${apiAvatarPath.includes('?') ? '&' : '?'}v=${cacheBust}`;
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
