/**
 * Page Skeletons
 * ==============
 * Lightweight skeleton screens shown on first load of each page.
 * Liquid glass aesthetic matching the current UI.
 */

import { Skeleton } from '@/components/ui/skeleton';

const SK = "bg-white/[0.06]";

/** Generic feed-style skeleton (Home, Explore, Bookmarks) */
export function FeedSkeleton() {
  return (
    <div className="space-y-3 p-2 sm:p-3 pt-0 sm:pt-0">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[0.08] bg-transparent p-3 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className={`w-9 h-9 rounded-md ${SK}`} />
            <div className="space-y-1.5 flex-1">
              <Skeleton className={`h-4 w-28 ${SK}`} />
              <Skeleton className={`h-3 w-16 ${SK}`} />
            </div>
          </div>
          <Skeleton className={`h-4 w-full ${SK}`} />
          <Skeleton className={`h-4 w-3/4 ${SK}`} />
          <Skeleton className={`h-48 w-full rounded-lg ${SK}`} />
          <div className="flex gap-4 pt-1">
            <Skeleton className={`h-8 w-16 rounded-xl ${SK}`} />
            <Skeleton className={`h-8 w-16 rounded-xl ${SK}`} />
            <Skeleton className={`h-8 w-16 rounded-xl ${SK}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Profile page skeleton */
export function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className={`h-32 w-full ${SK}`} />
      <div className="px-4 space-y-3">
        <div className="flex items-end gap-3 -mt-10">
          <Skeleton className={`w-20 h-20 rounded-xl ${SK} border-4 border-black`} />
          <Skeleton className={`h-9 w-24 rounded-xl ${SK} ml-auto`} />
        </div>
        <Skeleton className={`h-5 w-40 ${SK}`} />
        <Skeleton className={`h-4 w-28 ${SK}`} />
        <Skeleton className={`h-4 w-full ${SK}`} />
        <div className="flex gap-4">
          <Skeleton className={`h-4 w-20 ${SK}`} />
          <Skeleton className={`h-4 w-20 ${SK}`} />
        </div>
      </div>
      <div className="flex gap-0 border-b border-white/[0.08]">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className={`h-10 flex-1 ${SK}`} />
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
      <Skeleton className={`h-9 w-full rounded-lg ${SK}`} />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className={`w-12 h-12 rounded-xl ${SK}`} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className={`h-4 w-32 ${SK}`} />
            <Skeleton className={`h-3 w-48 ${SK}`} />
          </div>
          <Skeleton className={`h-3 w-10 ${SK}`} />
        </div>
      ))}
    </div>
  );
}

/** Notifications skeleton */
export function NotificationsSkeleton() {
  return (
    <div className="p-4 space-y-2">
      <Skeleton className={`h-8 w-48 ${SK} mb-4`} />
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className={`w-10 h-10 rounded-md ${SK}`} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className={`h-4 w-3/4 ${SK}`} />
            <Skeleton className={`h-3 w-24 ${SK}`} />
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
          <Skeleton key={i} className={`h-9 flex-1 rounded-lg ${SK}`} />
        ))}
      </div>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className={`w-7 h-7 rounded-lg ${SK}`} />
          <Skeleton className={`w-10 h-10 rounded-md ${SK}`} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className={`h-4 w-28 ${SK}`} />
            <Skeleton className={`h-3 w-20 ${SK}`} />
          </div>
          <Skeleton className={`h-4 w-16 ${SK}`} />
        </div>
      ))}
    </div>
  );
}

/** Settings skeleton */
export function SettingsSkeleton() {
  return (
    <div className="p-4 space-y-6">
      <Skeleton className={`h-8 w-32 ${SK}`} />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <div className="space-y-1.5">
            <Skeleton className={`h-4 w-36 ${SK}`} />
            <Skeleton className={`h-3 w-56 ${SK}`} />
          </div>
          <Skeleton className={`h-6 w-11 rounded-full ${SK}`} />
        </div>
      ))}
    </div>
  );
}

/** Grid-style skeleton (TV, Music) */
export function GridSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className={`h-8 w-48 ${SK}`} />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className={`aspect-video rounded-xl ${SK}`} />
        ))}
      </div>
    </div>
  );
}

/** Generic page skeleton fallback */
export function GenericPageSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className={`h-8 w-48 ${SK}`} />
      <Skeleton className={`h-4 w-full ${SK}`} />
      <Skeleton className={`h-4 w-3/4 ${SK}`} />
      <Skeleton className={`h-64 w-full rounded-xl ${SK}`} />
    </div>
  );
}