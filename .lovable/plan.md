
# Fix Native Tooltips + Add Followers Drawer Pagination (Capped at 3 Pages)

## Part 1: Replace All Remaining Native `title` Tooltips

Replace `title="..."` with the liquid glass `Tooltip` component in these files:

### Files to update:

1. **`src/components/app/cards/VideoCard.tsx`** (line ~1180)
   - PiP button `title="Picture in Picture (P)"` -> Tooltip

2. **`src/components/app/radio/RadioMiniPlayer.tsx`** (lines ~208, ~217)
   - Minimize button `title="Minimize player"` -> Tooltip
   - Fullscreen button `title="Fullscreen visualizer"` -> Tooltip

3. **`src/components/app/chat/PublicChat.tsx`** (lines ~176, ~209, ~219)
   - Room description `title={roomDescription}` -> Tooltip
   - Create room button `title="Create new room"` -> Tooltip
   - Settings button `title="Room settings"` -> Tooltip

4. **`src/components/app/chat/ChatMessage.tsx`** (line ~110)
   - Moderator badge `title="Moderator"` -> Tooltip

5. **`src/components/app/chat/GroupSettingsDrawer.tsx`** (line ~370)
   - Block user button `title="Block user from group"` -> Tooltip

6. **`src/components/app/cards/CommentsSection.tsx`** (line ~777)
   - Sort toggle button with dynamic title -> Tooltip

7. **`src/components/app/TranslatableText.tsx`** (line ~75)
   - Link anchor `title={url}` -> Tooltip showing the URL

Each replacement follows the established pattern:
```
<Tooltip>
  <TooltipTrigger asChild>
    <element>...</element>
  </TooltipTrigger>
  <TooltipContent>Text</TooltipContent>
</Tooltip>
```

---

## Part 2: Followers/Following Drawer Pagination (Max 3 Pages)

Currently the drawer calls `getFollowList` once without pagination params, loading only the default page. The API already supports `page` and `limit` parameters and returns a `pagination` object with `hasMore`.

### Changes to `src/components/app/profile/FollowersListDrawer.tsx`:

1. **New state variables**:
   - `currentPage` (starts at 1)
   - `hasMore` (from API pagination response)
   - `isLoadingMore` (loading indicator for subsequent pages)
   - `totalCount` (from pagination response, shown in header)
   - **`MAX_PAGES = 3`** constant -- hard cap, no more loading after page 3

2. **Initial fetch** updated to pass `{ page: 1, limit: 30 }` and store pagination metadata

3. **Scroll-based load more**: Add an `IntersectionObserver` on a sentinel div at the bottom of the list. When visible and `currentPage < MAX_PAGES && hasMore && !isLoadingMore`, trigger `loadMore`

4. **`loadMore` function**:
   - Fetch page `currentPage + 1` with `limit: 30`
   - Append new items to existing `users` array
   - Run batch-avatars enrichment only on newly fetched items if needed
   - Update `hasMore` and `currentPage`
   - Stop if `currentPage >= MAX_PAGES`

5. **UI additions**:
   - Spinner at list bottom while loading more
   - Total count in drawer header: "Followers (247)"
   - When capped at max pages, no further loading triggers -- list just ends naturally

6. **Reset on close**: Clear `currentPage`, `hasMore`, `totalCount` along with existing resets

### Technical details

- Max 3 pages x 30 items = 90 users max loaded per drawer open
- Enrichment runs per-batch (only new items), not re-enriching the full list
- `IntersectionObserver` is more efficient than scroll event listeners
- The API's `pagination.hasMore` naturally handles lists shorter than 3 pages
