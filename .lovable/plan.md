
# Fix PPV/Bounty/Locked Filters for Videos Page

## Problem
The content access filters (PPV, Bounty, Locked) work on the Home feed but not on the Videos feed.

**Root cause**: The two feeds use different API endpoints with different capabilities:
- **Home feed** → `/api/feed` endpoint (via `useUnifiedFeed`) - supports server-side filtering with `isPPV`, `hasBounty`, `isLocked` parameters
- **Videos feed** → `/api/nfts/search` endpoint (via `useDeHubVideos`) - does NOT support these filter parameters

Currently, VideosFeed applies client-side filtering using `filterByContentType()`, but the underlying API either doesn't return the `is_ppv`, `is_w2e`, `is_locked` fields, or they're always false/undefined.

## Solution Options

### Option A: Switch VideosFeed to use the Unified Feed endpoint (Recommended)
Modify `VideosFeed` to use the same `/api/feed` endpoint as HomeFeed, filtering by `postType: 'video'`. This would give VideosFeed access to:
- Server-side PPV/Bounty/Locked filtering
- Consistent data structure with `streamInfo` field
- Better performance (no client-side filtering needed)

### Option B: Add filter params to searchNFTs
Extend the `searchNFTs` function to pass PPV/Bounty/Locked parameters IF the backend supports them (requires API documentation verification).

---

## Recommended Implementation (Option A)

### 1. Update VideosFeed to use useUnifiedFeed
Replace `useDeHubVideos` with `useUnifiedFeed`, passing `postType: 'video'` and the content access filter parameters.

### 2. Update the data mapping
The unified feed returns `UnifiedFeedItem` objects which need to be mapped using `mapToVideoItem` instead of `mapNFTToVideoItem`.

### 3. Remove client-side content filtering
Since the API will handle filtering, remove the `filterByContentType` call from the useMemo chain.

---

## Technical Details

### File changes:

**`src/components/app/feeds/VideosFeed.tsx`**
- Replace import: `useDeHubVideos` → `useUnifiedFeed`
- Add imports: `mapToVideoItem` from `use-unified-feed`
- Update the hook call to include content access filters:
  ```typescript
  const { data, ... } = useUnifiedFeed({
    limit: 20,
    postType: 'video',
    sortBy: getSortBy(selectedSort.value),
    range: getDateRange(selectedUploadDate.value),
    address: walletAddress,
    isPPV: contentFilters.ppv ? true : undefined,
    hasBounty: contentFilters.w2e ? true : undefined,
    isLocked: contentFilters.locked ? true : undefined,
  });
  ```
- Update video mapping to use `mapToVideoItem` from unified feed
- Remove the `filterByContentType` call from the useMemo pipeline

### Mapping the sort options
Create helper functions similar to HomeFeed:
- `getSortBy()` - maps UI sort values to API `sortBy` parameter
- `getDateRange()` - maps date filter to API `range` parameter

### Shorts carousel
The shorts carousel fetch can remain using `useDeHubVideos` since it doesn't need content access filtering.
