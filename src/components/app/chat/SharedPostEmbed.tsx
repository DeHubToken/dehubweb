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

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNFTInfo } from '@/lib/api/dehub';
import { QuotedPostEmbed } from '@/components/app/cards/QuotedPostEmbed';

interface SharedPostEmbedProps {
  tokenId: string;
  className?: string;
  /**
   * DM bubbles size themselves to their content, so the card is pinned to
   * 280px there. Everywhere else — feed bodies, comments, the composer — it
   * should fill the column like the other entity cards do.
   */
  fullWidth?: boolean;
  /** Rendered when the post cannot be loaded (deleted, private, API down). */
  fallback?: ReactNode;
}

export function SharedPostEmbed({ tokenId, className, fullWidth = false, fallback = null }: SharedPostEmbedProps) {
  // Reuse the same cache key SinglePostPage uses so an already-viewed post is instant.
  const { data: post, isLoading, isError } = useQuery({
    queryKey: ['single-post', tokenId],
    queryFn: () => getNFTInfo(tokenId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const widthClass = fullWidth ? 'w-full' : 'w-[280px] max-w-full';

  if (isLoading) {
    return (
      <div className={`${widthClass} h-40 rounded-2xl bg-white/[0.05] border border-zinc-700/60 animate-pulse ${className || ''}`} />
    );
  }

  // The surfaces strip the URL out of the text on the assumption that this card
  // replaces it, so rendering nothing here would drop the link entirely.
  if (isError || !post) return <>{fallback}</>;

  return (
    <div className={widthClass}>
      <QuotedPostEmbed quotedPost={post} className={className} />
    </div>
  );
}
