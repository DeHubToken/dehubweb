
# Code Cleanup Plan - COMPLETED ✅

## Overview
This plan identified and removed unused code to prevent confusion and reduce technical debt. The cleanup focused on dead code, duplicate implementations, and consolidating repeated helper functions.

---

## Completed Tasks

### ✅ 1. Deleted Completely Unused Files
- Deleted `src/data/mock-feed.data.ts` (~1,057 lines saved)
- Deleted `src/hooks/use-audio-analyser.ts` (~50 lines saved)
- Removed `useAudioAnalyser` export from `src/hooks/index.ts`

### ✅ 2. Consolidated Duplicate Helper Functions
Added `formatTimeAgo`, `formatDuration`, `formatViews` to `src/lib/feed-utils.ts` and updated all files to import from there:
- `src/hooks/use-dehub-feed.ts` - removed local helpers
- `src/hooks/use-unified-feed.ts` - removed local helpers
- `src/hooks/use-bookmarks.ts` - removed local helpers
- `src/components/app/feeds/MusicFeed.tsx` - removed local helpers
- `src/components/app/feeds/HomeFeed.tsx` - removed local helpers
- `src/components/app/cards/CommentsSection.tsx` - removed local formatTimeAgo

### ✅ 3. Unified Comments System
- Kept `CommentsSection.tsx` (the full-featured 876-line component with voice notes, search, tabs)
- Updated `LiveCard.tsx` to use `CommentsSection` instead of `CommentsSheet`
- Updated `ShortsViewer.tsx` to use `CommentsSection` instead of `CommentsSheet`
- Deleted `src/components/app/comments/CommentsSheet.tsx`
- Deleted `src/components/app/comments/CommentItem.tsx`
- Deleted `src/components/app/comments/CommentInput.tsx`
- Deleted `src/components/app/comments/types.ts`
- Updated `src/components/app/comments/index.ts` to re-export CommentsSection

---

## Impact Summary
- **~2,000+ lines of dead/duplicate code removed**
- **Single source of truth** for formatting helpers in `@/lib/feed-utils`
- **Single comment system** (`CommentsSection`) across all card types
- **Prevents future confusion** when editing comments or feeds

---

## Files Deleted (5 files)
- `src/data/mock-feed.data.ts`
- `src/hooks/use-audio-analyser.ts`
- `src/components/app/comments/CommentsSheet.tsx`
- `src/components/app/comments/CommentItem.tsx`
- `src/components/app/comments/CommentInput.tsx`
- `src/components/app/comments/types.ts`

## Files Modified (10 files)
- `src/lib/feed-utils.ts` - Added formatTimeAgo, formatDuration, formatViews
- `src/lib/index.ts` - Exported new helpers
- `src/hooks/index.ts` - Removed useAudioAnalyser export
- `src/hooks/use-dehub-feed.ts` - Now imports helpers
- `src/hooks/use-unified-feed.ts` - Now imports helpers
- `src/hooks/use-bookmarks.ts` - Now imports helpers
- `src/components/app/feeds/MusicFeed.tsx` - Now imports helpers
- `src/components/app/feeds/HomeFeed.tsx` - Now imports helpers
- `src/components/app/cards/CommentsSection.tsx` - Now imports formatTimeAgo
- `src/components/app/cards/LiveCard.tsx` - Uses CommentsSection
- `src/components/app/cards/ShortsViewer.tsx` - Uses CommentsSection
- `src/components/app/comments/index.ts` - Re-exports CommentsSection
