
# Fix: Tab Switching Causes Feed Refresh (Cache Key Mismatch)

## Problem Summary

When switching between tabs (Home, Videos, Images, Shorts, Music, Live), each feed refreshes instead of loading instantly from the prefetched cache. This happens because React Query uses **deep equality** to match cache keys, and the prefetch hook is generating query keys that don't exactly match what the feed components generate.

## Root Cause Analysis

React Query's cache lookup requires **exact** key matching. Even if a key has `{ address: undefined }` vs `{ address: walletAddress || undefined }` where walletAddress is null, these may serialize differently. More critically:

1. **VideosFeed** passes 10 parameters to `useUnifiedFeed`, but prefetch may be missing some or have different values
2. **ImagesFeed** uses `useDeHubImages` which wraps `useDeHubFeed` with specific params
3. **ShortsFeed** uses `useDeHubVideos` which also wraps `useDeHubFeed`
4. **MusicFeed** uses a custom inline `useInfiniteQuery` with `walletAddress` directly (not `walletAddress || null`)
5. **LiveFeed** uses `useDeHubLive` which has its own query key format

## Solution: Exact Query Key Matching

For each feed, trace the exact parameters passed to the hook and the exact query key generated, then replicate that precisely in the prefetch.

### 1. Videos Feed Fix

**Component calls** (VideosFeed.tsx lines 417-428):
```typescript
useUnifiedFeed({
  limit: 20,
  postType: 'video',
  sortBy: 'createdAt',      // getUnifiedSortBy('random') returns 'createdAt'
  sortOrder: 'desc',
  range: undefined,          // getUnifiedRange('all') returns undefined
  address: walletAddress || undefined,
  isPPV: undefined,          // contentFilters.ppv || undefined where ppv=false
  hasBounty: undefined,      // contentFilters.w2e || undefined where w2e=false
  isLocked: undefined,       // contentFilters.locked || undefined where locked=false
  status: 'minted',
})
```

**Query key generated** (use-unified-feed.ts line 404):
```typescript
['unified-feed', { postType, sortBy, sortOrder, range, address, isPPV, hasBounty, isLocked, status }, 20]
```

**Prefetch must use**: Same exact object structure

### 2. Images Feed Fix

**Component calls** (ImagesFeed.tsx lines 295-299):
```typescript
useDeHubImages({
  unit: 15,
  sortMode: 'new',           // selectedSort.value='random' → 'new'
  address: walletAddress || undefined,
})
```

**useDeHubImages adds** `postType: 'feed-images'`
**useDeHubFeed generates key** (line 303):
```typescript
['dehub-feed', { unit: 15, sortMode: 'new', address, postType: 'feed-images', status: 'minted' }]
```

### 3. Shorts Feed Fix

**Component calls** (ShortsFeed.tsx lines 253-258):
```typescript
useDeHubVideos({
  unit: 15,
  sortMode: 'new',           // getApiSortMode('random') returns 'new'
  category: undefined,        // selectedCategory || undefined where selectedCategory=null
  address: walletAddress || undefined,
})
```

**useDeHubVideos** just calls useDeHubFeed without postType
**Query key**: `['dehub-feed', { unit: 15, sortMode: 'new', category: undefined, address, status: 'minted' }]`

### 4. Music Feed Fix

**Component uses inline query** (MusicFeed.tsx line 440):
```typescript
queryKey: ['music-videos-infinite', walletAddress]
```

Note: Uses `walletAddress` directly, which could be `null` not `undefined`. Prefetch must match exactly.

### 5. Live Feed Fix

**Component calls** (LiveFeed.tsx):
```typescript
useDeHubLive({ unit: 15, sortMode: 'recent' })
```

**Query key** (use-dehub-feed.ts line 370):
```typescript
['dehub-live', { unit: 15, sortMode: 'recent' }]
```

## File Changes

**File: `src/hooks/use-feed-prefetch.ts`**

Complete rewrite of the prefetch parameters to exactly match each feed component's query keys:

| Feed | Query Key | Current Prefetch Issue | Fix |
|------|-----------|------------------------|-----|
| Videos | `['unified-feed', params, 20]` | Missing/wrong params | Match VideosFeed's exact useUnifiedFeed call |
| Images | `['dehub-feed', params]` | Wrong structure | Match ImagesFeed → useDeHubImages → useDeHubFeed chain |
| Shorts | `['dehub-feed', params]` | Wrong structure | Match ShortsFeed → useDeHubVideos → useDeHubFeed chain |
| Music | `['music-videos-infinite', walletAddress]` | Using `\|\| null` but component uses raw value | Use `walletAddress` directly (null if not logged in) |
| Live | `['dehub-live', options]` | Check exact options object | Match `{ unit: 15, sortMode: 'recent' }` |

## Implementation Details

### Key Insight: Object Spreading Order Matters

When `useDeHubFeed` does:
```typescript
const { enabled = true, status = 'minted', ...searchParams } = options;
queryKey: ['dehub-feed', { ...searchParams, status }]
```

The key contains `searchParams` spread first, then `status`. This means the prefetch must pass params that will spread into the same structure.

### Prefetch Code Structure

```typescript
// Videos - must match useUnifiedFeed query key exactly
const videosParams = {
  postType: 'video',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  range: undefined,
  address: walletAddress || undefined,
  isPPV: undefined,
  hasBounty: undefined,
  isLocked: undefined,
  status: 'minted',
};
queryKey: ['unified-feed', videosParams, 20]

// Images - must match useDeHubFeed query key after useDeHubImages processing
// useDeHubImages adds postType: 'feed-images', useDeHubFeed adds status: 'minted'
const imagesSearchParams = {
  unit: 15,
  sortMode: 'new',
  address: walletAddress || undefined,
  postType: 'feed-images',
};
queryKey: ['dehub-feed', { ...imagesSearchParams, status: 'minted' }]

// Shorts - must match useDeHubFeed query key after useDeHubVideos processing
// useDeHubVideos doesn't add postType, useDeHubFeed adds status: 'minted'
const shortsSearchParams = {
  unit: 15,
  sortMode: 'new',
  category: undefined,
  address: walletAddress || undefined,
};
queryKey: ['dehub-feed', { ...shortsSearchParams, status: 'minted' }]

// Music - exact match
queryKey: ['music-videos-infinite', walletAddress ?? null]

// Live - exact match
queryKey: ['dehub-live', { unit: 15, sortMode: 'recent' }]
```

## Expected Result

After this fix:
1. User loads the app → Home feed loads
2. Background prefetch runs with **exactly matching** query keys  
3. User clicks any tab (Videos, Images, Shorts, Music, Live) → **Instant load** from cache
4. No loading spinners or data refetching on tab switch

## Verification Steps

1. Open browser dev tools → Network tab
2. Load the app on Home feed
3. Wait 1-2 seconds for prefetch to complete
4. Switch to Videos tab → Should see NO new network requests for feed data
5. Repeat for Images, Shorts, Music, Live tabs
