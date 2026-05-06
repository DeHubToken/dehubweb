/**
 * Page Skeletons
 * ==============
 * Lightweight skeleton screens shown on first load of each page.
 * Each skeleton matches the actual page layout precisely.
 * Liquid glass aesthetic: bg-white/[0.06] shimmer, border-white/[0.08] outlines.
 */

import { Skeleton } from '@/components/ui/skeleton';

const SK = "bg-white/[0.06]";

// ─── Home Feed ──────────────────────────────────────────────────────────────

/**
 * In-page home feed skeleton (center column only).
 * Used inside HomeFeed and PersistentPageCache where the AppLayout shell
 * (sidebars, header) is already mounted.
 */
export function FeedSkeleton() {
  return (
    <div className="min-w-0 flex-1">
      <div className="p-2 sm:p-3 space-y-3">
        {/* Mixed feed cards */}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
            <div className="flex items-center gap-3 pb-3">
              <Skeleton className={`w-9 h-9 rounded-md flex-shrink-0 ${SK}`} />
              <div className="space-y-1.5 flex-1">
                <Skeleton className={`h-4 w-28 rounded ${SK}`} />
                <Skeleton className={`h-3 w-16 rounded ${SK}`} />
              </div>
              <Skeleton className={`h-7 w-7 rounded-md ${SK}`} />
            </div>
            {i === 1 ? (
              <div className="space-y-2">
                <Skeleton className={`h-4 w-full rounded ${SK}`} />
                <Skeleton className={`h-4 w-5/6 rounded ${SK}`} />
                <Skeleton className={`h-4 w-2/3 rounded ${SK}`} />
              </div>
            ) : i === 2 ? (
              <div className="grid grid-cols-2 gap-1.5">
                <Skeleton className={`aspect-square rounded-lg ${SK}`} />
                <Skeleton className={`aspect-square rounded-lg ${SK}`} />
                <Skeleton className={`aspect-square rounded-lg ${SK}`} />
                <Skeleton className={`aspect-square rounded-lg ${SK}`} />
              </div>
            ) : (
              <Skeleton className={`w-full aspect-video rounded-lg ${SK}`} />
            )}
            <div className="flex items-center gap-4 pt-3">
              <Skeleton className={`h-8 w-14 rounded-xl ${SK}`} />
              <Skeleton className={`h-8 w-14 rounded-xl ${SK}`} />
              <Skeleton className={`h-8 w-14 rounded-xl ${SK}`} />
              <Skeleton className={`h-8 w-14 rounded-xl ml-auto ${SK}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Left desktop sidebar shell — logo + nav bento + post button */
function HomeLeftSidebarSkeleton() {
  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-[231px] px-[18px] pb-2 flex-col">
      {/* Logo row */}
      <div className="flex items-center mb-[15px] mt-[9px]">
        <Skeleton className={`w-7 h-7 rounded-lg mr-1.5 ${SK}`} />
        <Skeleton className={`h-[36px] w-[120px] rounded ${SK}`} />
      </div>
      {/* Nav bento */}
      <div className="bg-zinc-900 rounded-2xl flex-1 min-h-0 p-2.5 space-y-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2.5 py-2.5">
            <Skeleton className={`w-5 h-5 rounded ${SK}`} />
            <Skeleton className={`h-3.5 rounded ${SK}`} style={{ width: `${60 + (i % 4) * 18}px` }} />
          </div>
        ))}
      </div>
      {/* Post button */}
      <div className="mt-3">
        <Skeleton className={`h-11 w-full rounded-2xl ${SK}`} />
      </div>
    </aside>
  );
}

/** Right desktop sidebar shell — search + tabbed panel + what's happening */
function HomeRightSidebarSkeleton() {
  return (
    <aside className="hidden lg:block w-72 xl:w-80 2xl:w-88 h-screen sticky top-0 px-4 pt-[8px] pb-4">
      {/* Search */}
      <Skeleton className={`h-9 w-full rounded-xl ${SK}`} />
      {/* Tabbed side panel */}
      <div className="mt-[11px] space-y-4">
        <div className="bg-zinc-900 rounded-2xl p-3 space-y-3">
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className={`h-8 flex-1 rounded-lg ${SK}`} />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className={`w-9 h-9 rounded-full ${SK}`} />
              <div className="flex-1 space-y-1.5">
                <Skeleton className={`h-3.5 w-24 rounded ${SK}`} />
                <Skeleton className={`h-3 w-16 rounded ${SK}`} />
              </div>
              <Skeleton className={`h-7 w-16 rounded-lg ${SK}`} />
            </div>
          ))}
        </div>
        {/* What's happening */}
        <div className="bg-zinc-900 rounded-2xl p-3 space-y-3">
          <Skeleton className={`h-4 w-32 rounded ${SK}`} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className={`h-3 w-20 rounded ${SK}`} />
              <Skeleton className={`h-4 w-40 rounded ${SK}`} />
              <Skeleton className={`h-3 w-16 rounded ${SK}`} />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/**
 * Full app-shell home skeleton — used by App-level Suspense fallbacks
 * (before AppLayout mounts) so first paint matches the real layout
 * with both sidebars on desktop.
 */
export function HomeShellSkeleton() {
  return (
    <div className="flex w-full mx-auto" style={{ maxWidth: '80rem' }}>
      <HomeLeftSidebarSkeleton />
      <FeedSkeleton />
      <HomeRightSidebarSkeleton />
    </div>
  );
}


// ─── Explore ────────────────────────────────────────────────────────────────

/** Explore page skeleton — sticky search header + tab bar + feed cards */
export function ExploreSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Search Header */}
      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
        <div className="bg-zinc-900 rounded-2xl p-3 sm:p-4">
          <div className="flex gap-2">
            <Skeleton className={`flex-1 h-[48px] rounded-xl ${SK}`} />
            <Skeleton className={`w-12 h-[48px] rounded-xl ${SK}`} />
          </div>
        </div>

        {/* Tabs Bento */}
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex-1 flex items-center justify-center gap-2 py-2 px-2">
                <Skeleton className={`w-4 h-4 rounded ${SK}`} />
                <Skeleton className={`h-4 w-12 rounded hidden sm:block ${SK}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content cards */}
      <div className="p-2 sm:p-3 pt-0 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.08] bg-transparent p-3 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className={`w-9 h-9 rounded-md flex-shrink-0 ${SK}`} />
              <div className="space-y-1.5 flex-1">
                <Skeleton className={`h-4 w-28 ${SK}`} />
                <Skeleton className={`h-3 w-16 ${SK}`} />
              </div>
            </div>
            <Skeleton className={`h-48 w-full rounded-lg ${SK}`} />
            <div className="flex gap-4 pt-1">
              <Skeleton className={`h-8 w-16 rounded-xl ${SK}`} />
              <Skeleton className={`h-8 w-16 rounded-xl ${SK}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Profile ────────────────────────────────────────────────────────────────

/** Profile page skeleton — cover photo + avatar + glass tabs with icon/count stacks */
export function ProfileSkeleton() {
  return (
    <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
      {/* Profile Card Bento */}
      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        <Skeleton className={`aspect-[3/1] w-full ${SK}`} />
        <div className="px-4 sm:px-6 pb-4">
          <div className="flex items-end justify-between -mt-12 sm:-mt-14 mb-4">
            <Skeleton className={`w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-4 border-zinc-900 ${SK}`} />
            <Skeleton className={`h-9 w-24 rounded-xl ${SK}`} />
          </div>
          <div className="space-y-2">
            <Skeleton className={`h-5 w-40 ${SK}`} />
            <Skeleton className={`h-4 w-28 ${SK}`} />
          </div>
          <div className="mt-3 space-y-1.5">
            <Skeleton className={`h-4 w-full ${SK}`} />
            <Skeleton className={`h-4 w-3/4 ${SK}`} />
          </div>
          <div className="flex gap-4 mt-3">
            <Skeleton className={`h-4 w-24 ${SK}`} />
            <Skeleton className={`h-4 w-24 ${SK}`} />
          </div>
        </div>
      </div>

      {/* Profile Tabs Bento — icon + count stacks */}
      <div className="bg-black/50 backdrop-blur-[24px] border border-white/[0.12] rounded-2xl p-1.5">
        <div className="flex gap-0.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 py-[7px] min-w-[52px]">
              <Skeleton className={`w-[18px] h-[18px] rounded ${SK}`} />
              <Skeleton className={`w-5 h-[10px] rounded ${SK}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[0.08] bg-transparent p-3 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className={`w-9 h-9 rounded-md flex-shrink-0 ${SK}`} />
            <div className="space-y-1.5 flex-1">
              <Skeleton className={`h-4 w-28 ${SK}`} />
              <Skeleton className={`h-3 w-16 ${SK}`} />
            </div>
          </div>
          <Skeleton className={`h-40 w-full rounded-lg ${SK}`} />
        </div>
      ))}
    </div>
  );
}

// ─── Messages ───────────────────────────────────────────────────────────────

/** Messages page skeleton — full-height bento with header, search, conversation list */
export function MessagesSkeleton() {
  return (
    <div className="h-full p-3 sm:p-4">
      <div className="w-full h-[calc(100dvh-120px)] lg:h-[calc(100dvh-32px)] bg-zinc-900 rounded-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Skeleton className={`w-10 h-10 rounded-xl ${SK}`} />
              <Skeleton className={`h-6 w-28 ${SK}`} />
            </div>
            <Skeleton className={`w-8 h-8 rounded-lg ${SK}`} />
          </div>
          {/* Search bar */}
          <Skeleton className={`h-10 w-full rounded-xl ${SK}`} />
        </div>

        {/* Public chat pinned row */}
        <div className="flex items-center gap-3 p-4">
          <Skeleton className={`w-12 h-12 rounded-xl ${SK}`} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className={`h-4 w-28 ${SK}`} />
            <Skeleton className={`h-3 w-40 ${SK}`} />
          </div>
        </div>

        {/* Conversation rows */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className={`w-12 h-12 rounded-xl ${SK}`} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className={`h-4 w-32 ${SK}`} />
              <Skeleton className={`h-3 w-48 ${SK}`} />
            </div>
            <Skeleton className={`h-3 w-10 ${SK}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Notifications ──────────────────────────────────────────────────────────

/** Notifications skeleton — header bento + scrollable tab bar + notification rows */
export function NotificationsSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="p-3 sm:p-4">
        <div className="bg-zinc-900 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className={`w-9 h-9 rounded-xl ${SK}`} />
              <Skeleton className={`h-5 w-32 ${SK}`} />
            </div>
            <Skeleton className={`w-8 h-8 rounded-xl ${SK}`} />
          </div>
        </div>
      </div>

      {/* Tab bar bento */}
      <div className="px-3 sm:px-4 py-2">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex gap-1 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 flex items-center justify-center gap-2 px-3 sm:px-4 py-2">
                <Skeleton className={`w-4 h-4 rounded ${SK}`} />
                <Skeleton className={`h-4 w-10 rounded hidden sm:block ${SK}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notification rows */}
      <div className="px-3 sm:px-4 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className={`w-10 h-10 rounded-xl ${SK}`} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className={`h-4 w-3/4 ${SK}`} />
              <Skeleton className={`h-3 w-24 ${SK}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

/** Leaderboard skeleton — header bento with trophy + filter pills + search + table rows */
export function LeaderboardSkeleton() {
  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header Bento */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <Skeleton className={`w-14 h-14 rounded-full ${SK}`} />
          <div className="space-y-2">
            <Skeleton className={`h-5 w-32 ${SK}`} />
            <Skeleton className={`h-4 w-48 ${SK}`} />
          </div>
        </div>
        {/* Category filter pills */}
        <div className="flex gap-1.5 overflow-hidden mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className={`h-9 rounded-xl flex-shrink-0 ${SK} ${i === 0 ? 'w-24' : 'w-20'}`} />
          ))}
        </div>
        {/* Time period pills + sort */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1.5 flex-1 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className={`h-8 w-12 rounded-lg flex-shrink-0 ${SK}`} />
            ))}
          </div>
          <Skeleton className={`w-8 h-8 rounded-lg ${SK}`} />
        </div>
        {/* Search bar */}
        <Skeleton className={`h-10 w-full rounded-xl ${SK}`} />
      </div>

      {/* Table Bento */}
      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-zinc-800/50 last:border-b-0">
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
    </div>
  );
}

// ─── Settings ───────────────────────────────────────────────────────────────

/** Settings skeleton — header bento with icon tabs + content bento with form fields */
export function SettingsSkeleton() {
  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header Bento */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Skeleton className={`w-10 h-10 rounded-xl ${SK}`} />
            <div className="space-y-2">
              <Skeleton className={`h-5 w-24 ${SK}`} />
              <Skeleton className={`h-4 w-40 ${SK}`} />
            </div>
          </div>
          <Skeleton className={`h-9 w-20 rounded-xl ${SK}`} />
        </div>
        {/* Tab icon pills */}
        <div className="flex gap-[6px] sm:gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className={`p-[11px] sm:p-3 w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${SK}`} />
          ))}
        </div>
      </div>

      {/* Content Bento */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 space-y-6">
        {/* Cover photo placeholder */}
        <Skeleton className={`w-full h-32 rounded-xl ${SK}`} />
        {/* Avatar + name */}
        <div className="flex items-center gap-4 -mt-4">
          <Skeleton className={`w-20 h-20 rounded-full ${SK}`} />
          <div className="space-y-2">
            <Skeleton className={`h-4 w-32 ${SK}`} />
            <Skeleton className={`h-3 w-48 ${SK}`} />
          </div>
        </div>
        {/* Form fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className={`h-4 w-24 ${SK}`} />
            <Skeleton className={`h-10 w-full rounded-lg ${SK}`} />
          </div>
          <div className="space-y-2">
            <Skeleton className={`h-4 w-20 ${SK}`} />
            <Skeleton className={`h-10 w-full rounded-lg ${SK}`} />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className={`h-4 w-12 ${SK}`} />
          <Skeleton className={`h-20 w-full rounded-lg ${SK}`} />
        </div>
      </div>
    </div>
  );
}

// ─── Features ───────────────────────────────────────────────────────────────

/** Features page skeleton — header bento with search + page tabs + category pills */
export function FeaturesSkeleton() {
  return (
    <div className="min-h-screen p-3 sm:p-4">
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className={`w-12 h-12 rounded-xl ${SK}`} />
            <div className="space-y-2">
              <Skeleton className={`h-5 w-32 ${SK}`} />
              <Skeleton className={`h-4 w-40 ${SK}`} />
            </div>
          </div>
          <Skeleton className={`h-9 w-20 rounded-xl ${SK}`} />
        </div>
        {/* Search */}
        <Skeleton className={`h-10 w-full rounded-xl mb-3 ${SK}`} />
        {/* Page tabs */}
        <div className="flex gap-1 bg-zinc-800/40 rounded-xl p-1 mb-3">
          <Skeleton className={`flex-1 h-9 rounded-lg ${SK}`} />
          <Skeleton className={`flex-1 h-9 rounded-lg ${SK}`} />
        </div>
        {/* Category pills */}
        <div className="flex gap-2 overflow-hidden mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className={`h-8 w-20 rounded-lg flex-shrink-0 ${SK}`} />
          ))}
        </div>
        {/* Sort pills */}
        <div className="flex gap-1.5 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className={`h-8 w-16 rounded-lg flex-shrink-0 ${SK}`} />
          ))}
        </div>
      </div>

      {/* Feature request cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className={`w-9 h-9 rounded-md ${SK}`} />
              <div className="space-y-1.5 flex-1">
                <Skeleton className={`h-4 w-40 ${SK}`} />
                <Skeleton className={`h-3 w-20 ${SK}`} />
              </div>
            </div>
            <Skeleton className={`h-4 w-full ${SK}`} />
            <Skeleton className={`h-4 w-3/4 ${SK}`} />
            <div className="flex gap-3 pt-1">
              <Skeleton className={`h-8 w-16 rounded-xl ${SK}`} />
              <Skeleton className={`h-8 w-16 rounded-xl ${SK}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Grid (TV, Music) ───────────────────────────────────────────────────────

/** Grid-style skeleton for media pages — header + category pills + video grid */
export function GridSkeleton() {
  return (
    <div className="p-3 sm:p-4 space-y-4">
      {/* Header bento */}
      <div className="bg-zinc-900 rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className={`w-10 h-10 rounded-xl ${SK}`} />
          <Skeleton className={`h-5 w-28 ${SK}`} />
        </div>
        {/* Category pills */}
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className={`h-8 w-20 rounded-lg flex-shrink-0 ${SK}`} />
          ))}
        </div>
      </div>
      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className={`aspect-video rounded-xl ${SK}`} />
            <div className="flex items-center gap-2">
              <Skeleton className={`w-8 h-8 rounded-md ${SK}`} />
              <div className="flex-1 space-y-1">
                <Skeleton className={`h-3 w-3/4 ${SK}`} />
                <Skeleton className={`h-2 w-1/2 ${SK}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Generic Fallback ───────────────────────────────────────────────────────

/** Generic page skeleton fallback */
export function GenericPageSkeleton() {
  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className={`w-10 h-10 rounded-xl ${SK}`} />
          <div className="space-y-2">
            <Skeleton className={`h-5 w-32 ${SK}`} />
            <Skeleton className={`h-4 w-48 ${SK}`} />
          </div>
        </div>
        <Skeleton className={`h-4 w-full ${SK}`} />
        <Skeleton className={`h-4 w-3/4 mt-2 ${SK}`} />
      </div>
      <Skeleton className={`h-64 w-full rounded-xl ${SK}`} />
    </div>
  );
}
