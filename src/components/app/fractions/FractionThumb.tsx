/**
 * Fraction Thumb
 * ==============
 * The square picture on every fraction tile (market, portfolio, profile).
 *
 * Listings carry a snapshot of the post's picture, but older listings of
 * multi-image posts were saved without one, a post can be deleted, and text
 * and audio posts never had a picture. So: show the snapshot; if it is
 * missing or fails to load, ask the post itself once; and if the post has no
 * picture either, draw a text card from its title and opening lines. A tile
 * never shows an empty grey box.
 */

import { memo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cdnImage } from '@/lib/media-url';
import { DEHUB_CDN_BASE } from '@/lib/api/dehub';
import { fractionImageFor } from '@/lib/fraction-thumb';
import { getNFTInfo } from '@/lib/api/dehub/feed';
import Music from '@/components/ui/cut-icons/music';

interface FractionThumbProps {
  tokenId: string;
  imageUrl?: string | null;
  title?: string | null;
  postType?: string | null;
  width?: number;
  className?: string;
}

// A multi-image post's first picture is stored as feed-images/{tokenId}-1.jpg.
// Used when the post itself can no longer be read (deleted or hidden).
const firstFeedImage = (tokenId: string, postType?: string | null) =>
  /images/.test(postType || '') ? `${DEHUB_CDN_BASE}feed-images/${tokenId}-1.jpg` : null;

function useFractionPostPreview(tokenId: string, postType: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['fraction-post-preview', tokenId],
    enabled,
    staleTime: 60 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const post = await getNFTInfo(tokenId);
        return {
          imageUrl: fractionImageFor(post as never, 400) || firstFeedImage(tokenId, postType),
          title: (post?.name || '').trim() || null,
          text: (post?.description || '').trim() || null,
          postType: (post as { postType?: string })?.postType || null,
        };
      } catch {
        // Deleted or hidden post: the text card still has the listing title.
        return { imageUrl: firstFeedImage(tokenId, postType), title: null, text: null, postType: null };
      }
    },
  });
}

export const FractionThumb = memo(function FractionThumb({
  tokenId,
  imageUrl,
  title,
  postType,
  width = 400,
  className = '',
}: FractionThumbProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const snapshot = imageUrl ? cdnImage(imageUrl, { width }) : '';
  const needsPost = !snapshot || failed === snapshot;
  const { data: post } = useFractionPostPreview(tokenId, postType, needsPost);

  const fallback = post?.imageUrl ? cdnImage(post.imageUrl, { width }) : '';
  const src = !needsPost ? snapshot : fallback && failed !== fallback ? fallback : '';

  if (src) {
    return (
      <img
        src={src}
        alt={title || ''}
        className={`w-full h-full object-cover ${className}`}
        loading="lazy"
        onError={() => setFailed(src)}
      />
    );
  }

  const heading = (title || '').trim() || post?.title || '';
  const body = post?.text || '';
  const kind = postType || post?.postType || '';
  const isAudio = /audio/.test(kind);

  return (
    <div
      data-fraction-text-card
      className="w-full h-full relative overflow-hidden flex flex-col gap-1.5 px-3.5 pt-10 pb-3 bg-gradient-to-br from-white/[0.09] to-white/[0.02]"
    >
      {isAudio && <Music className="w-6 h-6 text-white/30 mb-1" />}
      {heading && (
        <p className="relative font-serif text-[15px] leading-snug font-semibold text-white/90 line-clamp-2">
          {heading}
        </p>
      )}
      {body && (
        <p className="relative font-serif text-[11px] leading-relaxed text-white/55 whitespace-pre-line line-clamp-4">
          {body}
        </p>
      )}
      {!heading && !body && (
        <p className="relative font-serif text-sm text-white/40">#{tokenId}</p>
      )}
    </div>
  );
});
