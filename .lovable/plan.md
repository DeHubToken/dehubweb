

## Fix Shorts Feed: Show More Items and Improve Load Speed

### Root Cause Analysis

**Why only 2 items show up:** The Shorts feed fetches 12 items from the API with NO `postType` filter, meaning it gets a mix of videos, images, and text posts. Then it client-side filters to only items with a `videoUrl` -- most of the 12 items are images/text, leaving only ~2 actual videos visible. This immediately triggers the infinite scroll loader (ugly "Load More" right away).

**Why it's slow:** The prefetch cache key matches, but the data is the same mixed-content batch. There is no server-side caching for shorts specifically.

---

### Changes

**1. ShortsFeed.tsx -- Add postType filter to API call**
- Pass `postType: 'video'` to `useDeHubVideos` so the API returns ONLY video content
- This ensures all 12 items are videos, eliminating the client-side filtering that drops most results
- Remove the redundant `videosOnly` client-side filter since the API now handles it

**2. use-feed-prefetch.ts -- Fix prefetch to match**
- Update the shorts prefetch call to include `postType: 'video'` so it fetches only videos
- Update the cache key to include `postType: 'video'` so it matches the component's query key
- This ensures the prefetch cache hit works and shorts load instantly from cache

**3. ShortsFeed.tsx -- Use useDeHubFeed directly with postType**
- Since `useDeHubVideos` is a wrapper that omits `postType`, switch to `useDeHubFeed` directly with `postType: 'video'` to get proper API-level filtering

---

### Technical Details

```
ShortsFeed.tsx (line ~17-18):
  - Import useDeHubFeed instead of useDeHubVideos
  
ShortsFeed.tsx (line ~361-373):
  - Change: useDeHubVideos({ unit: 12, sortMode, category })
  - To: useDeHubFeed({ unit: 12, sortMode, category, postType: 'video' })

ShortsFeed.tsx (lines ~391-397):
  - Remove the client-side videosOnly filter (hasVideo check)
  - Apply date filter and sorting directly on allRawNFTs

use-feed-prefetch.ts (lines ~101-107):
  - Add postType: 'video' to the shortsPromise searchNFTs call

use-feed-prefetch.ts (lines ~200-219):
  - Add postType: 'video' to the shortsParams cache key object
```

### Expected Result
- Shorts tab shows a full grid of 6+ video thumbnails immediately (all 12 items are videos)
- No ugly immediate "Load More" trigger
- Prefetch cache hit means instant tab switch
- Feed loads from warm cache within the existing 5-minute pg_cron refresh cycle

