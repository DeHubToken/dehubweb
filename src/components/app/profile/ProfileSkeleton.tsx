import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton UI for the profile page.
 * Mirrors the ProfileHeader layout so the page feels instant
 * while data loads in the background.
 */
export function ProfileSkeleton() {
  return (
    <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
      {/* Profile Card skeleton */}
      <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] overflow-hidden">
        {/* Cover photo placeholder */}
        <Skeleton className="aspect-[3/1] w-full bg-white/[0.06] rounded-none" />

        <div className="px-4 sm:px-6 pb-4">
          {/* Avatar + action buttons row */}
          <div className="relative -mt-12 sm:-mt-14 mb-4 flex items-end justify-between">
            <Skeleton className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-white/[0.06] border-2 border-zinc-900" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-24 rounded-xl bg-white/[0.06]" />
              <Skeleton className="h-9 w-9 rounded-xl bg-white/[0.06]" />
            </div>
          </div>

          {/* Name */}
          <Skeleton className="h-6 w-40 bg-white/[0.06] rounded-md" />
          {/* Handle */}
          <Skeleton className="h-5 w-28 bg-white/[0.06] rounded-md mt-1.5" />
          {/* Bio lines */}
          <Skeleton className="h-4 w-full bg-white/[0.06] rounded-md mt-3" />
          <Skeleton className="h-4 w-3/4 bg-white/[0.06] rounded-md mt-1.5" />
          {/* Joined date */}
          <Skeleton className="h-4 w-32 bg-white/[0.06] rounded-md mt-3" />
          {/* Followers / Following */}
          <div className="flex items-center gap-4 mt-3">
            <Skeleton className="h-4 w-24 bg-white/[0.06] rounded-md" />
            <Skeleton className="h-4 w-24 bg-white/[0.06] rounded-md" />
          </div>
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="bg-zinc-900 rounded-xl p-1">
        <div className="flex gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 h-12 rounded-xl bg-white/[0.06] min-w-[52px]" />
          ))}
        </div>
      </div>

      {/* Content skeleton - 3 post placeholders */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg bg-white/[0.06]" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-32 bg-white/[0.06] rounded-md" />
                <Skeleton className="h-3 w-20 bg-white/[0.06] rounded-md" />
              </div>
            </div>
            <Skeleton className="h-4 w-full bg-white/[0.06] rounded-md" />
            <Skeleton className="h-4 w-2/3 bg-white/[0.06] rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
