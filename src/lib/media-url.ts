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
  if (!address) return undefined;
  
  // If it's already a dehubcdn URL, return as-is
  if (apiAvatarPath.startsWith('https://dehubcdn')) return apiAvatarPath;
  
  // If it's any api.dehub.io URL (avatars or other paths), extract extension and rebuild with CDN
  if (apiAvatarPath.includes('api.dehub.io')) {
    const ext = getExtension(apiAvatarPath);
    return `${DEHUB_CDN_BASE}avatars/${address}.${ext}`;
  }
  
  // Other full URLs (dicebear, external CDNs, etc.) - return as-is
  if (apiAvatarPath.startsWith('http')) return apiAvatarPath;
  
  // Relative path - build CDN URL
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

/**
 * Validate if media URL is likely valid (not empty, not a known broken pattern)
 * Returns false for URLs that are known to be broken or invalid
 */
export function isValidMediaUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url.trim() === '') return false;
  
  // Check for placeholder or broken URL patterns
  const brokenPatterns = [
    'undefined',
    'null',
    'placeholder',
    '.undefined',
    '.null',
  ];
  
  const lowerUrl = url.toLowerCase();
  for (const pattern of brokenPatterns) {
    if (lowerUrl.includes(pattern)) return false;
  }
  
  return true;
}

/**
 * Check if an NFT/content item has valid media assets
 * Returns false if the content has broken/missing images or videos
 */
export function hasValidMedia(item: {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  videoUrl?: string | null;
  thumbnail?: string | null;
  postType?: string;
}): boolean {
  // For videos, must have valid thumbnail or image
  if (item.postType === 'video' || item.videoUrl) {
    const thumbnail = item.imageUrl || item.thumbnail;
    return isValidMediaUrl(thumbnail);
  }
  
  // For multi-image posts
  if (item.imageUrls && item.imageUrls.length > 0) {
    // At least first image must be valid
    return isValidMediaUrl(item.imageUrls[0]);
  }
  
  // For single image posts
  if (item.imageUrl) {
    return isValidMediaUrl(item.imageUrl);
  }
  
  // Text posts don't need media
  if (item.postType === 'feed-simple') {
    return true;
  }
  
  return false;
}
