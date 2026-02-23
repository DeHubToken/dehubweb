/**
 * Feed Skeleton Components
 * ========================
 * Shimmering skeleton loaders for all feed content types.
 * Provides better perceived loading experience than spinners.
 * 
 * @module components/app/feeds/FeedSkeletons
 */

import { cn } from '@/lib/utils';

// ============================================================================
// BASE SKELETON
// ============================================================================

interface SkeletonProps {
  className?: string;
}

function Skeleton({ className }: SkeletonProps) {
  return (
    <div 
      className={cn(
        "animate-pulse bg-white/[0.06] rounded-lg",
        className
      )} 
    />
  );
}

// ============================================================================
// STORIES SKELETON
// ============================================================================

export function StoriesBarSkeleton() {
  return (
    <div className="p-4 mt-[7px]">
      <div className="flex gap-4 overflow-hidden">
        {/* Create button skeleton */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <Skeleton className="w-[72px] h-[72px] rounded-xl" />
          <Skeleton className="w-12 h-3 rounded" />
        </div>
        {/* Story items skeleton */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0">
            <Skeleton className="w-[68px] h-[68px] rounded-xl" />
            <Skeleton className="w-14 h-3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// VIDEO CARD SKELETON
// ============================================================================

export function VideoCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-transparent p-3">
      {/* Header */}
      <div className="pb-3 flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-md flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </div>
      </div>
      {/* Thumbnail */}
      <Skeleton className="w-full aspect-video rounded-lg" />
      {/* Footer */}
      <div className="pt-3 space-y-2">
        <Skeleton className="h-4 w-3/4 rounded" />
        <div className="flex gap-4">
          <Skeleton className="h-8 w-16 rounded-full" />
          <Skeleton className="h-8 w-16 rounded-full" />
          <Skeleton className="h-8 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// IMAGE CARD SKELETON
// ============================================================================

export function ImageCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-transparent p-3">
      {/* Header */}
      <div className="pb-3 flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-md flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </div>
      </div>
      {/* Image */}
      <Skeleton className="w-full aspect-square rounded-lg" />
      {/* Footer */}
      <div className="pt-3 space-y-2">
        <Skeleton className="h-4 w-2/3 rounded" />
        <div className="flex gap-4">
          <Skeleton className="h-8 w-16 rounded-full" />
          <Skeleton className="h-8 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// POST CARD SKELETON (Text posts)
// ============================================================================

export function PostCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-transparent p-3">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-10 h-10 rounded-md flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </div>
      </div>
      {/* Content lines */}
      <div className="space-y-2 mb-3">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-5/6 rounded" />
        <Skeleton className="h-4 w-2/3 rounded" />
      </div>
      {/* Actions */}
      <div className="flex gap-4">
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>
    </div>
  );
}

// ============================================================================
// SHORTS GRID SKELETON
// ============================================================================

export function ShortsGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
      ))}
    </div>
  );
}

// ============================================================================
// SHORTS THUMBNAIL SKELETON
// ============================================================================

export function ShortsThumbnailSkeleton() {
  return (
    <Skeleton className="aspect-[9/16] rounded-xl" />
  );
}

// ============================================================================
// MUSIC VIDEO SKELETON
// ============================================================================

export function MusicVideoCardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="w-full aspect-video rounded-xl" />
      <div className="flex items-center gap-2">
        <Skeleton className="w-8 h-8 rounded-md flex-shrink-0" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3 w-3/4 rounded" />
          <Skeleton className="h-2 w-1/2 rounded" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LIVE STREAM SKELETON
// ============================================================================

export function LiveStreamCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-transparent p-3 flex-shrink-0 w-72 sm:w-80">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3">
        <Skeleton className="w-10 h-10 rounded-md flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
      </div>
      {/* Thumbnail */}
      <Skeleton className="w-full aspect-video rounded-lg" />
      {/* Actions */}
      <div className="pt-3 space-y-2">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}

// ============================================================================
// IMAGE COLLAGE SKELETON
// ============================================================================

export function ImageCollageSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-1">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-sm" />
      ))}
    </div>
  );
}

// ============================================================================
// CATEGORY PILLS SKELETON
// ============================================================================

export function CategoryPillsSkeleton() {
  return (
    <div className="p-3">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton 
            key={i} 
            className={cn("h-8 rounded-xl flex-shrink-0", i === 0 ? "w-14" : "w-20")} 
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// COMPOSITE SKELETONS - Full feed loading states
// ============================================================================

/**
 * Home feed skeleton - mix of content types
 */
export function HomeFeedSkeleton() {
  return (
    <div className="space-y-3">
      <VideoCardSkeleton />
      <PostCardSkeleton />
      <ImageCardSkeleton />
      <VideoCardSkeleton />
      <PostCardSkeleton />
    </div>
  );
}

/**
 * Videos feed skeleton
 */
export function VideosFeedSkeleton() {
  return (
    <div className="space-y-3">
      <CategoryPillsSkeleton />
      <VideoCardSkeleton />
      <VideoCardSkeleton />
      <VideoCardSkeleton />
    </div>
  );
}

/**
 * Images feed skeleton - collage mode
 */
export function ImagesFeedSkeleton() {
  return (
    <div className="space-y-3">
      <CategoryPillsSkeleton />
      <ImageCollageSkeleton />
    </div>
  );
}

/**
 * Shorts feed skeleton
 */
export function ShortsFeedSkeleton() {
  return (
    <div className="space-y-3">
      <CategoryPillsSkeleton />
      <ShortsGridSkeleton />
    </div>
  );
}

/**
 * Music feed skeleton
 */
export function MusicFeedSkeleton() {
  return (
    <div className="space-y-4">
      {/* Sub-tab pills */}
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-xl flex-shrink-0" />
        ))}
      </div>
      {/* Videos carousel placeholder */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-48 flex-shrink-0">
              <MusicVideoCardSkeleton />
            </div>
          ))}
        </div>
      </div>
      {/* Radio section placeholder */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-40 rounded" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-[280px] h-20 rounded-xl flex-shrink-0" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Live feed skeleton
 */
export function LiveFeedSkeleton() {
  return (
    <div className="space-y-4">
      {/* Categories skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24 rounded ml-1" />
        <div className="flex gap-3 overflow-hidden pr-12">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0">
              <Skeleton className="w-24 sm:w-28 aspect-[3/4] rounded-xl" />
              <Skeleton className="h-3 w-20 rounded mt-1.5" />
            </div>
          ))}
        </div>
      </div>
      {/* Streams skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-20 rounded ml-1" />
        <div className="flex gap-3 overflow-hidden pr-12">
          <LiveStreamCardSkeleton />
          <LiveStreamCardSkeleton />
          <LiveStreamCardSkeleton />
        </div>
      </div>
    </div>
  );
}
