/**
 * Feed Skeleton Components
 * ========================
 * Shimmering skeleton loaders matching the liquid glass bento card UI.
 * Avatars are rounded-md, action buttons are rounded-xl, cards use border-white/[0.08].
 * Collapse-aware: skeletons match multi-column layouts in fullscreen mode.
 * 
 * @module components/app/feeds/FeedSkeletons
 */

import { cn } from '@/lib/utils';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';

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
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
      {/* Header */}
      <div className="pb-3 flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-md flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </div>
      </div>
      {/* Thumbnail */}
      <Skeleton className="w-full aspect-video rounded-lg" />
      {/* Footer */}
      <div className="pt-3 space-y-2">
        <Skeleton className="h-4 w-3/4 rounded" />
        <div className="flex gap-4">
          <Skeleton className="h-8 w-16 rounded-xl" />
          <Skeleton className="h-8 w-16 rounded-xl" />
          <Skeleton className="h-8 w-16 rounded-xl" />
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
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
      {/* Header */}
      <div className="pb-3 flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-md flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </div>
      </div>
      {/* Image */}
      <Skeleton className="w-full aspect-square rounded-lg" />
      {/* Footer */}
      <div className="pt-3 space-y-2">
        <Skeleton className="h-4 w-2/3 rounded" />
        <div className="flex gap-4">
          <Skeleton className="h-8 w-16 rounded-xl" />
          <Skeleton className="h-8 w-16 rounded-xl" />
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
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-9 h-9 rounded-md flex-shrink-0" />
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
        <Skeleton className="h-8 w-16 rounded-xl" />
        <Skeleton className="h-8 w-16 rounded-xl" />
        <Skeleton className="h-8 w-16 rounded-xl" />
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
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3 flex-shrink-0 w-72 sm:w-80">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3">
        <Skeleton className="w-9 h-9 rounded-md flex-shrink-0" />
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

export function ImageCollageSkeleton({ cols = 3 }: { cols?: number }) {
  const count = cols * 4;
  return (
    <div 
      className={cn(
        "grid gap-0.5 sm:gap-1 overflow-hidden rounded-t-2xl",
        cols === 4 ? "grid-cols-4" : "grid-cols-3"
      )}
      style={{ gridAutoFlow: 'dense' }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const isLarge = i % 4 === 0;
        return (
          <Skeleton 
            key={i} 
            className={cn(
              "aspect-square rounded-none",
              isLarge && "col-span-2 row-span-2"
            )} 
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// FILTER PILLS SKELETON (GlassFilterRow style)
// ============================================================================

export function CategoryPillsSkeleton() {
  return (
    <div className="p-3">
      <div className="flex gap-1.5 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
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
// COMPOSITE SKELETONS - Full feed loading states (collapse-aware)
// ============================================================================

/**
 * Home feed skeleton - matches 3-column masonry in collapsed mode
 */
export function HomeFeedSkeleton() {
  const { isCollapsed } = useSidebarCollapse();

  if (isCollapsed) {
    return (
      <div style={{ columnCount: 3, columnGap: '0.75rem' }}>
        {[VideoCardSkeleton, PostCardSkeleton, ImageCardSkeleton, VideoCardSkeleton, PostCardSkeleton, ImageCardSkeleton, PostCardSkeleton, VideoCardSkeleton, PostCardSkeleton].map((Card, i) => (
          <div key={i} className="mb-3" style={{ breakInside: 'avoid' }}>
            <Card />
          </div>
        ))}
      </div>
    );
  }

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
 * Videos feed skeleton - matches 2-column grid in collapsed mode
 */
export function VideosFeedSkeleton() {
  const { isCollapsed } = useSidebarCollapse();

  return (
    <div className="space-y-3">
      <CategoryPillsSkeleton />
      <div className={cn("space-y-3", isCollapsed && "sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0")}>
        {Array.from({ length: isCollapsed ? 6 : 3 }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Images feed skeleton - matches 4-col collage in collapsed mode
 */
export function ImagesFeedSkeleton() {
  const { isCollapsed } = useSidebarCollapse();

  return (
    <div className="space-y-3">
      <CategoryPillsSkeleton />
      <ImageCollageSkeleton cols={isCollapsed ? 4 : 3} />
    </div>
  );
}

/**
 * Shorts feed skeleton - wider grid in collapsed mode
 */
export function ShortsFeedSkeleton() {
  const { isCollapsed } = useSidebarCollapse();

  return (
    <div className="space-y-3">
      <CategoryPillsSkeleton />
      <div className={cn("grid gap-1", isCollapsed ? "grid-cols-4 sm:grid-cols-5" : "grid-cols-3")}>
        {Array.from({ length: isCollapsed ? 10 : 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * Music feed skeleton - matches AllSection layout with carousels
 */
export function MusicFeedSkeleton() {
  return (
    <div className="space-y-4">
      {/* Sub-tab pills (All, Tracks, Videos, Podcasts, Radio, Stages) */}
      <div className="flex gap-1.5 overflow-hidden pl-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-[72px] rounded-lg flex-shrink-0" />
        ))}
      </div>

      {/* Music Videos carousel section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-36 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <div className="flex gap-3 overflow-hidden pr-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-[280px] flex-shrink-0">
              <MusicVideoCardSkeleton />
            </div>
          ))}
        </div>
      </div>

      {/* Radio Stations carousel section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <div className="flex gap-3 overflow-hidden pr-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="w-[280px] h-20 rounded-xl flex-shrink-0" />
          ))}
        </div>
      </div>

      {/* Stages section */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-20 rounded" />
        <div className="flex gap-3 overflow-hidden pr-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="w-[200px] h-16 rounded-xl flex-shrink-0" />
          ))}
        </div>
      </div>

      {/* Tracks section */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-16 rounded" />
        <Skeleton className="h-4 w-32 rounded" />
      </div>

      {/* Podcasts section */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-20 rounded" />
        <Skeleton className="h-4 w-32 rounded" />
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
      {/* Streams skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-20 rounded ml-1" />
        <div className="flex gap-3 overflow-hidden pr-12">
          <LiveStreamCardSkeleton />
          <LiveStreamCardSkeleton />
          <LiveStreamCardSkeleton />
        </div>
      </div>
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
    </div>
  );
}
