import { DEHUB_API_BASE } from './core';

/** Text cards are served by the production worker, shared with mobile. */
export function getTextPostShareImageUrl(tokenId: string | number): string {
  if (!/^[1-9]\d{0,14}$/.test(String(tokenId))) throw new Error('Invalid post id');
  return `https://dehub.io/_og/post/v2/${tokenId}.png`;
}

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
