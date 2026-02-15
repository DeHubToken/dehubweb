
# Fix All Skeletons to Match Current UI/UX

## Problem
Skeleton loading states across the app use outdated styles (`bg-zinc-900 rounded-2xl`, `rounded-full` avatars, solid backgrounds) that don't match the current liquid glass bento design system (`rounded-xl border border-white/[0.08] bg-transparent p-3`, `rounded-md` avatars).

## Changes

### 1. `src/components/app/feeds/FeedSkeletons.tsx` (main skeleton file)

**Base Skeleton component:**
- Change from `bg-zinc-800/60 rounded-lg` to `bg-white/[0.06] rounded-lg` (matches glass aesthetic)

**StoriesBarSkeleton:**
- Remove solid `bg-zinc-900 rounded-2xl` wrapper, use transparent with `-mt-[7px]` to match actual StoriesBar

**VideoCardSkeleton:**
- Change wrapper from `bg-zinc-900 rounded-2xl` to `rounded-xl border border-white/[0.08] bg-transparent p-3` (bento style)
- Change avatar from `rounded-full` to `rounded-md` (squared-off)

**ImageCardSkeleton:**
- Same bento wrapper update
- Avatar to `rounded-md`

**PostCardSkeleton:**
- Same bento wrapper update
- Avatar to `rounded-md`

**LiveStreamCardSkeleton:**
- Keep `bg-zinc-900 rounded-2xl` (LiveStreamCard actually uses this)
- Avatar to `rounded-md`

**CategoryPillsSkeleton:**
- Remove solid `bg-zinc-900 rounded-2xl` wrapper, use transparent (category bars sit directly on background per memory)

**ImageCollageSkeleton / ShortsGridSkeleton / MusicVideoCardSkeleton:**
- Update shimmer color to `bg-white/[0.06]`

### 2. `src/pages/app/BookmarksPage.tsx`

**BookmarksSkeleton:**
- Change wrapper from `bg-zinc-900 rounded-2xl` to bento style
- Avatar from `rounded-full` to `rounded-md`

### 3. `src/components/app/AuthGate.tsx`

**Loading skeleton:**
- Change `bg-zinc-800` to `bg-white/[0.06]` for the avatar, text, and button placeholders

### 4. `src/pages/app/MessagesPage.tsx`

**ConversationsSkeleton:**
- Change `bg-zinc-800` overrides to `bg-white/[0.06]` (Skeleton component already has base color)

### 5. `src/components/app/sidebar/SidebarChat.tsx`

**Chat loading skeleton:**
- Change `bg-zinc-800` overrides to `bg-white/[0.06]`
- Avatar from `rounded-full` to `rounded-md`

### 6. `src/components/app/tv/LiveTVSection.tsx`

**TV channel loading skeleton:**
- Change wrapper from `bg-zinc-900/50 rounded-2xl` to `rounded-xl border border-white/[0.08] bg-transparent p-3`
- Already uses `rounded-lg` for avatars which is fine for TV cards

### 7. `src/pages/app/PostInfoPage.tsx`

**Token holders loading skeleton:**
- Change avatar from `rounded-full` to `rounded-md`

### 8. `src/components/app/profile/FollowersListDrawer.tsx`

**Followers loading skeleton:**
- Already uses `rounded-lg` avatars and `bg-white/5` rows -- no changes needed (already matches)

### 9. `src/features/post/components/LinkPreviews.tsx`

**Link preview loading skeleton:**
- Already uses `bg-white/5 border border-white/10 rounded-xl` -- matches glass style, no changes needed

### 10. `src/components/app/chat/DirectMessageChat.tsx`

**Message loading skeleton:**
- Change `bg-zinc-800` to `bg-white/[0.06]`
- Avatar from `rounded-xl` is fine for chat context

---

## Summary

| Component | Issue | Fix |
|-----------|-------|-----|
| FeedSkeletons base | `bg-zinc-800/60` | `bg-white/[0.06]` |
| Card wrappers | `bg-zinc-900 rounded-2xl` | `rounded-xl border border-white/[0.08] bg-transparent p-3` |
| All avatars | `rounded-full` | `rounded-md` |
| Category pills | Solid wrapper | No wrapper |
| Stories bar | Solid wrapper | Transparent, match actual |
| AuthGate | `bg-zinc-800` | `bg-white/[0.06]` |
| Messages | `bg-zinc-800` | `bg-white/[0.06]` |
| Bookmarks | `bg-zinc-900` | Bento style |
| SidebarChat | `bg-zinc-800` | `bg-white/[0.06]` |
| TV Section | `bg-zinc-900/50` | Bento style |
| PostInfoPage | `rounded-full` avatar | `rounded-md` |
| DirectMessageChat | `bg-zinc-800` | `bg-white/[0.06]` |

**Files to modify: 8 files total**
- `src/components/app/feeds/FeedSkeletons.tsx`
- `src/pages/app/BookmarksPage.tsx`
- `src/components/app/AuthGate.tsx`
- `src/pages/app/MessagesPage.tsx`
- `src/components/app/sidebar/SidebarChat.tsx`
- `src/components/app/tv/LiveTVSection.tsx`
- `src/pages/app/PostInfoPage.tsx`
- `src/components/app/chat/DirectMessageChat.tsx`
