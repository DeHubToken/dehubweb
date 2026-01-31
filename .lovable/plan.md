
# Code Cleanup Plan

## Overview
This plan identifies and removes unused code to prevent confusion and reduce technical debt. The cleanup focuses on dead code, duplicate implementations, and consolidating repeated helper functions.

---

## Issues Found

### 1. Duplicate Comments System (HIGH PRIORITY)
There are **two separate comment implementations** that caused the earlier confusion:
- `src/components/app/cards/CommentsSection.tsx` - 876 lines, full-featured with voice notes, search, tabs
- `src/components/app/comments/CommentsSheet.tsx` - 275 lines, simpler drawer-based component

**Usage:**
- `CommentsSection` is used by: `PostCard`, `VideoCard`, `ImageCard`
- `CommentsSheet` is used by: `LiveCard`, `ShortsViewer`

**Recommendation:** Keep `CommentsSheet` (the simpler, modular one in the `/comments/` folder) and migrate all usages to it, then delete `CommentsSection`.

---

### 2. Unused Files (HIGH PRIORITY)

| File | Lines | Reason |
|------|-------|--------|
| `src/data/mock-feed.data.ts` | ~1,057 | Never imported anywhere - completely dead code |
| `src/hooks/use-audio-analyser.ts` | ~50 | Exported but never imported/used in any component |

---

### 3. Duplicated Helper Functions (MEDIUM PRIORITY)
These functions are copy-pasted across 5-7 files each:

| Function | Duplicated In |
|----------|---------------|
| `formatTimeAgo()` | 7 files: `CommentsSection.tsx`, `CommentsSheet.tsx`, `use-dehub-feed.ts`, `use-unified-feed.ts`, `use-bookmarks.ts`, `MusicFeed.tsx`, `HomeFeed.tsx` |
| `formatDuration()` | 5 files: `use-dehub-feed.ts`, `use-unified-feed.ts`, `use-bookmarks.ts`, `MusicFeed.tsx`, `HomeFeed.tsx` |
| `formatViews()` | 5 files: `use-dehub-feed.ts`, `use-unified-feed.ts`, `use-bookmarks.ts`, `MusicFeed.tsx`, `HomeFeed.tsx` |

**Recommendation:** Consolidate into `src/lib/feed-utils.ts` (which already exists) and import from there.

---

## Implementation Steps

### Step 1: Delete Completely Unused Files
1. Delete `src/data/mock-feed.data.ts` (~1,057 lines saved)
2. Delete `src/hooks/use-audio-analyser.ts` (~50 lines saved)
3. Remove `useAudioAnalyser` export from `src/hooks/index.ts`

### Step 2: Consolidate Duplicate Helper Functions
1. Add `formatTimeAgo`, `formatDuration`, `formatViews` to `src/lib/feed-utils.ts`
2. Export them from `src/lib/index.ts`
3. Update all 7+ files to import from `@/lib/feed-utils` instead of defining locally
4. Remove duplicate function definitions from each file

### Step 3: Unify Comments System
1. Update `PostCard.tsx` to use `CommentsSheet` instead of `CommentsSection`
2. Update `VideoCard.tsx` to use `CommentsSheet` instead of `CommentsSection`
3. Update `ImageCard.tsx` to use `CommentsSheet` instead of `CommentsSection`
4. Delete `src/components/app/cards/CommentsSection.tsx` (~876 lines saved)
5. Update `src/components/app/cards/index.ts` to remove `CommentsSection` export if present

### Step 4: Cleanup Exports
1. Remove dead exports from barrel files
2. Verify no broken imports remain

---

## Technical Details

### Files to Delete (3 files, ~1,983 lines)
- `src/data/mock-feed.data.ts`
- `src/hooks/use-audio-analyser.ts`
- `src/components/app/cards/CommentsSection.tsx`

### Files to Modify

**Add to `src/lib/feed-utils.ts`:**
```typescript
export function formatTimeAgo(dateString?: string): string { ... }
export function formatDuration(seconds?: number): string { ... }
export function formatViews(count?: number): string { ... }
```

**Update imports in:**
- `src/hooks/use-dehub-feed.ts`
- `src/hooks/use-unified-feed.ts`
- `src/hooks/use-bookmarks.ts`
- `src/components/app/feeds/MusicFeed.tsx`
- `src/components/app/feeds/HomeFeed.tsx`
- `src/components/app/comments/CommentsSheet.tsx`
- `src/components/app/cards/PostCard.tsx`
- `src/components/app/cards/VideoCard.tsx`
- `src/components/app/cards/ImageCard.tsx`

---

## Impact
- **~2,000 lines of dead/duplicate code removed**
- **Single source of truth** for formatting helpers
- **Single comment system** across all card types
- **Prevents future confusion** when editing comments or feeds
