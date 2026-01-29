
# Fix PPV/Bounty/Locked Filters for Videos Page

## Status: ✅ COMPLETED

## Problem
The content access filters (PPV, Bounty, Locked) worked on the Home feed but not on the Videos feed.

**Root cause**: The two feeds used different API endpoints with different capabilities:
- **Home feed** → `/api/feed` endpoint (via `useUnifiedFeed`) - supports server-side filtering with `isPPV`, `hasBounty`, `isLocked` parameters
- **Videos feed** → `/api/nfts/search` endpoint (via `useDeHubVideos`) - did NOT support these filter parameters

## Solution Implemented (Option A)

Switched `VideosFeed` to use the unified `/api/feed` endpoint, filtering by `postType: 'video'`. This gives VideosFeed access to:
- Server-side PPV/Bounty/Locked filtering
- Consistent data structure with `streamInfo` field
- Better performance (no client-side filtering needed)

### Changes Made:

**`src/components/app/feeds/VideosFeed.tsx`**
1. Replaced `useDeHubVideos` with `useUnifiedFeed` for the main video feed
2. Added helper functions:
   - `getUnifiedSortBy()` - maps UI sort values to API `sortBy` parameter
   - `getUnifiedRange()` - maps date filter to API `range` parameter
3. Updated the hook call to include content access filters passed to API:
   ```typescript
   useUnifiedFeed({
     limit: 20,
     postType: 'video',
     sortBy: getUnifiedSortBy(selectedSort.value),
     range: getUnifiedRange(selectedUploadDate.value),
     address: walletAddress || undefined,
     isPPV: contentFilters.ppv || undefined,
     hasBounty: contentFilters.w2e || undefined,
     isLocked: contentFilters.locked || undefined,
     status: 'minted',
   })
   ```
4. Updated data mapping to use `mapToVideoItem` from unified feed hook
5. Removed client-side `filterByContentType` call since API handles filtering

### Notes
- Shorts carousel still uses `useDeHubVideos` since it doesn't need content access filtering
- Duration filter remains client-side (API doesn't support it)
