import { buildFeedImageUrls, buildImageUrl } from '@/lib/media-url';

/**
 * The picture a fraction listing should carry for a post.
 *
 * `imageUrl` is the cover of a single-image or video post. Multi-image posts
 * (postType "feed-images") leave it empty and keep their pictures in
 * `imageUrls`, which is why every listing of one used to be snapshotted with
 * no thumbnail at all. Text and audio posts have neither, and get a text card.
 */
export function fractionImageFor(
  post: { tokenId?: number | string; imageUrl?: string | null; imageUrls?: string[] | null } | null | undefined,
  width = 400,
): string {
  if (!post) return '';
  const cover = post.tokenId != null ? buildImageUrl(post.tokenId, post.imageUrl, width) : '';
  if (cover) return cover;
  return buildFeedImageUrls(post.imageUrls?.filter(Boolean), width)?.[0] || '';
}
