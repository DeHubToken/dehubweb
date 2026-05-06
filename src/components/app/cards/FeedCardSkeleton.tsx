/**
 * FeedCardSkeleton
 * ================
 * Card-shaped skeleton placeholder used while feed items are loading.
 * Matches the geometry of real feed cards (bento wrapper, avatar+meta,
 * media slot, action bar) so there's no layout shift when real content
 * replaces it.
 *
 * Variants pick a media-slot height that mirrors video / image / text cards
 * so the masonry column doesn't visibly resize once data arrives.
 */

import { cn } from '@/lib/utils';

interface FeedCardSkeletonProps {
  variant?: 'video' | 'image' | 'text';
  className?: string;
}

const MEDIA_HEIGHTS: Record<NonNullable<FeedCardSkeletonProps['variant']>, string> = {
  video: 'h-[260px]',
  image: 'h-[360px]',
  text: 'h-0',
};

export function FeedCardSkeleton({ variant = 'video', className }: FeedCardSkeletonProps) {
  const mediaHeight = MEDIA_HEIGHTS[variant];

  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.12] bg-white/[0.03] p-3',
        'animate-pulse',
        className
      )}
      aria-hidden="true"
    >
      {/* Header: avatar + name/handle + menu */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-md bg-white/[0.06]" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3 w-32 max-w-[40%] rounded bg-white/[0.06]" />
          <div className="h-2.5 w-20 max-w-[28%] rounded bg-white/[0.05]" />
        </div>
        <div className="w-6 h-6 rounded bg-white/[0.05]" />
      </div>

      {/* Title / first line of body */}
      <div className="space-y-2 mb-3">
        <div className="h-3 w-[85%] rounded bg-white/[0.06]" />
        <div className="h-3 w-[60%] rounded bg-white/[0.05]" />
      </div>

      {/* Media slot (skipped for text-only) */}
      {variant !== 'text' && (
        <div className={cn('w-full rounded-md bg-white/[0.05] mb-3', mediaHeight)} />
      )}

      {/* Action bar row */}
      <div className="flex items-center gap-4 pt-1">
        <div className="h-4 w-12 rounded bg-white/[0.05]" />
        <div className="h-4 w-12 rounded bg-white/[0.05]" />
        <div className="h-4 w-12 rounded bg-white/[0.05]" />
        <div className="ml-auto h-4 w-8 rounded bg-white/[0.05]" />
      </div>
    </div>
  );
}

/**
 * A repeating column of mixed-variant skeleton cards for the home feed.
 * Pattern roughly matches the real interleave so the placeholder set has
 * the same visual rhythm as the real content.
 */
export function FeedCardSkeletonList({ count = 6 }: { count?: number }) {
  const pattern: FeedCardSkeletonProps['variant'][] = ['video', 'image', 'text', 'video', 'image', 'text'];
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <FeedCardSkeleton key={i} variant={pattern[i % pattern.length]} />
      ))}
    </div>
  );
}
