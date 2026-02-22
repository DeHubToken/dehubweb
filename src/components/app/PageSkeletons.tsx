/**
 * Page Skeletons
 * ==============
 * Lightweight skeleton screens shown on first load of each page.
 * These give immediate visual feedback while the real page lazy-loads.
 */

import { Skeleton } from '@/components/ui/skeleton';

/** Generic feed-style skeleton (Home, Explore, Bookmarks) */
export function FeedSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-zinc-900 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full bg-zinc-800" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-32 bg-zinc-800" />
              <Skeleton className="h-3 w-20 bg-zinc-800" />
            </div>
          </div>
          <Skeleton className="h-4 w-full bg-zinc-800" />
          <Skeleton className="h-4 w-3/4 bg-zinc-800" />
          <Skeleton className="h-48 w-full rounded-lg bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

/** Profile page skeleton */
export function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full bg-zinc-800" />
      <div className="px-4 space-y-3">
        <div className="flex items-end gap-3 -mt-10">
          <Skeleton className="w-20 h-20 rounded-full bg-zinc-800 border-4 border-black" />
          <Skeleton className="h-9 w-24 rounded-full bg-zinc-800 ml-auto" />
        </div>
        <Skeleton className="h-5 w-40 bg-zinc-800" />
        <Skeleton className="h-4 w-28 bg-zinc-800" />
        <Skeleton className="h-4 w-full bg-zinc-800" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-20 bg-zinc-800" />
          <Skeleton className="h-4 w-20 bg-zinc-800" />
        </div>
      </div>
      <div className="flex gap-0 border-b border-zinc-800">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 flex-1 bg-zinc-800/50" />
        ))}
      </div>
      <FeedSkeleton />
    </div>
  );
}

/** Messages page skeleton */
export function MessagesSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <Skeleton className="h-9 w-full rounded-lg bg-zinc-800" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="w-12 h-12 rounded-full bg-zinc-800" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32 bg-zinc-800" />
            <Skeleton className="h-3 w-48 bg-zinc-800" />
          </div>
          <Skeleton className="h-3 w-10 bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

/** Notifications skeleton */
export function NotificationsSkeleton() {
  return (
    <div className="p-4 space-y-2">
      <Skeleton className="h-8 w-48 bg-zinc-800 mb-4" />
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="w-10 h-10 rounded-full bg-zinc-800" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4 bg-zinc-800" />
            <Skeleton className="h-3 w-24 bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Leaderboard skeleton */
export function LeaderboardSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 flex-1 rounded-lg bg-zinc-800" />
        ))}
      </div>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="w-7 h-7 rounded-lg bg-zinc-800" />
          <Skeleton className="w-10 h-10 rounded-md bg-zinc-800" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-28 bg-zinc-800" />
            <Skeleton className="h-3 w-20 bg-zinc-800" />
          </div>
          <Skeleton className="h-4 w-16 bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

/** Settings skeleton */
export function SettingsSkeleton() {
  return (
    <div className="p-4 space-y-6">
      <Skeleton className="h-8 w-32 bg-zinc-800" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36 bg-zinc-800" />
            <Skeleton className="h-3 w-56 bg-zinc-800" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

/** Grid-style skeleton (TV, Music) */
export function GridSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-8 w-48 bg-zinc-800" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video rounded-lg bg-zinc-800" />
        ))}
      </div>
    </div>
  );
}

/** Generic page skeleton fallback */
export function GenericPageSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-8 w-48 bg-zinc-800" />
      <Skeleton className="h-4 w-full bg-zinc-800" />
      <Skeleton className="h-4 w-3/4 bg-zinc-800" />
      <Skeleton className="h-64 w-full rounded-xl bg-zinc-800" />
    </div>
  );
}
