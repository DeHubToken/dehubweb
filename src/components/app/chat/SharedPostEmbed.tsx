/**
 * Shared Post Embed (DM)
 * ======================
 * Renders a post that was shared into a direct message as a rich, tappable
 * card. Given a post tokenId (extracted from a /app/post/<id> link in the
 * message content), it fetches the post and reuses QuotedPostEmbed for the
 * visual — matching the mobile app's "post in DM" experience.
 *
 * Falls back to nothing on error, so the raw link text remains visible.
 */

import { useQuery } from '@tanstack/react-query';
import { getNFTInfo } from '@/lib/api/dehub';
import { QuotedPostEmbed } from '@/components/app/cards/QuotedPostEmbed';

interface SharedPostEmbedProps {
  tokenId: string;
  className?: string;
}

export function SharedPostEmbed({ tokenId, className }: SharedPostEmbedProps) {
  // Reuse the same cache key SinglePostPage uses so an already-viewed post is instant.
  const { data: post, isLoading, isError } = useQuery({
    queryKey: ['single-post', tokenId],
    queryFn: () => getNFTInfo(tokenId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className={`w-[280px] max-w-full h-40 rounded-2xl bg-white/[0.05] border border-zinc-700/60 animate-pulse ${className || ''}`} />
    );
  }

  // On error / missing post, render nothing — the link text stays as a fallback.
  if (isError || !post) return null;

  return (
    <div className="w-[280px] max-w-full">
      <QuotedPostEmbed quotedPost={post} className={className} />
    </div>
  );
}
