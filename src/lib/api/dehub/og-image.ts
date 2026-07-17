import { DEHUB_API_BASE } from './core';

/**
 * Get the OG share image URL for a post.
 * The backend generates a 1200×630 PNG card, used by social media previews
 * and in-app share-as-image features.
 */
export function getOgImageUrl(tokenId: number, width?: number, height?: number): string {
  const params = new URLSearchParams();
  if (width) params.set('width', String(width));
  if (height) params.set('height', String(height));
  const qs = params.toString();
  return `${DEHUB_API_BASE}/og-image/${tokenId}${qs ? `?${qs}` : ''}`;
}
