
# Fix: Tab Switching Causes Feed Refresh (Complete Solution)

## Problem Summary

When switching between tabs (Home, Videos, Images, Shorts, Music, Live), each feed refreshes instead of loading instantly from cache. The user sees a loading state every time they switch tabs.

## Root Cause Analysis

After investigating the network requests, I found **two distinct issues**:

### Issue 1: Wallet Address Timing Mismatch

Network logs show:
- **Prefetch call**: `GET /api/feed?...&status=minted` (NO address)
- **VideosFeed call**: `GET /api/feed?...&status=minted&address=0x8fa51...` (WITH address)

The prefetch runs with `walletAddress = null/undefined`, but when VideosFeed renders, the user is logged in and has a walletAddress. React Query sees these as **completely different queries** because the query keys don't match.

**Timeline:**
```
0ms     - HomePage mounts
500ms   - isHomeFeedLoaded = true
1500ms  - useFeedPrefetch runs, walletAddress might still be null
???ms   - Web3Auth finishes, walletAddress = "0x..."
         - User switches to Videos tab
         - VideosFeed uses walletAddress = "0x..." 
         - CACHE MISS! Different query key
```

### Issue 2: Inconsistent Query Key Structure

Even when walletAddress matches, the query key objects may have different structures:

```typescript
// Prefetch creates:
{ postType: 'video', sortBy: 'createdAt', status: 'minted' }

// VideosFeed creates (includes undefined keys):
{ postType: 'video', sortBy: 'createdAt', sortOrder: 'desc', 
  range: undefined, address: undefined, isPPV: undefined, 
  hasBounty: undefined, isLocked: undefined, status: 'minted' }
```

React Query's deep equality check fails because `{ a: undefined }` ≠ `{}`.

## Solution

### Part 1: Wait for Wallet State to Stabilize

Before prefetching, we need to ensure the wallet state is stable. If the user is in the process of connecting, wait for that to complete.

### Part 2: Prefetch Without User-Specific Params

For feeds that support it (Videos, Images, Shorts), prefetch the **public feed** (without address). Then, if the user IS logged in, also prefetch WITH their address.

This ensures:
- Logged-out users get instant cache hits
- Logged-in users get instant cache hits

### Part 3: Match Query Keys Exactly

Ensure every prefetch query key **exactly** matches what the feed component generates, including all `undefined` values.

## Implementation Changes

### File: `src/hooks/use-feed-prefetch.ts`

```typescript
// Key changes:

// 1. Track if wallet is ready (not in a connecting state)
const { walletAddress, isConnecting } = useAuth();

// 2. Wait for wallet state to be stable before prefetching
useEffect(() => {
  if (!isHomeFeedLoaded) return;
  if (isConnecting) return; // Wait for wallet connection to finish
  // ... rest of prefetch logic
}, [isHomeFeedLoaded, queryClient, walletAddress, isConnecting]);

// 3. Prefetch BOTH logged-out AND logged-in variants for each feed
async function prefetchAllFeeds(queryClient, walletAddress) {
  // Videos - prefetch WITHOUT address (public feed)
  const videosParamsPublic = {
    postType: 'video',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    range: undefined,
    address: undefined,  // Public feed
    isPPV: undefined,
    hasBounty: undefined,
    isLocked: undefined,
    status: 'minted',
  };
  prefetchPromises.push(prefetchVideos(videosParamsPublic));
  
  // Videos - if logged in, ALSO prefetch WITH address
  if (walletAddress) {
    const videosParamsAuth = {
      ...videosParamsPublic,
      address: walletAddress,
    };
    prefetchPromises.push(prefetchVideos(videosParamsAuth));
  }
  
  // Same pattern for Images, Shorts...
}
```

### File: `src/contexts/AuthContext.tsx` (if needed)

Export `isConnecting` state so prefetch can wait:
```typescript
export const useAuth = () => {
  // ...existing code
  return { walletAddress, isConnecting, /* ... */ };
};
```

## Detailed Changes by Feed

| Feed | Query Key Pattern | Fix |
|------|-------------------|-----|
| **Videos** | `['unified-feed', params, 20]` | Prefetch both `address: undefined` AND `address: walletAddress` variants. Include all `undefined` keys. |
| **Images** | `['dehub-feed', params]` | Prefetch both variants. Include `postType: 'feed-images'`. |
| **Shorts** | `['dehub-feed', params]` | Prefetch both variants. Include `category: undefined`. |
| **Music** | `['music-videos-infinite', walletAddress]` | Use exact `walletAddress` value (null vs undefined matters). |
| **Live** | `['dehub-live', params]` | No address needed - just match options exactly. |

## Technical Details

### VideosFeed Query Key (lines 417-428)
```typescript
useUnifiedFeed({
  limit: 20,
  postType: 'video',
  sortBy: getUnifiedSortBy(selectedSort.value), // 'random' → 'createdAt'
  sortOrder: 'desc',
  range: getUnifiedRange(selectedUploadDate.value), // 'all' → undefined
  address: walletAddress || undefined,
  isPPV: contentFilters.ppv || undefined,     // false → undefined
  hasBounty: contentFilters.w2e || undefined, // false → undefined
  isLocked: contentFilters.locked || undefined, // false → undefined
  status: 'minted',
})
// Query key: ['unified-feed', { postType, sortBy, sortOrder, range, address, isPPV, hasBounty, isLocked, status }, 20]
```

Prefetch must generate: `['unified-feed', { exactly same object }, 20]`

### ImagesFeed Query Key (lines 295-299)
```typescript
useDeHubImages({
  unit: 15,
  sortMode: selectedSort.value === 'most-liked' ? 'popular' : 'new', // 'random' → 'new'
  address: walletAddress || undefined,
})
// useDeHubImages adds postType: 'feed-images'
// useDeHubFeed adds status: 'minted'
// Query key: ['dehub-feed', { unit, sortMode, address, postType: 'feed-images', status: 'minted' }]
```

### ShortsFeed Query Key (lines 253-258)
```typescript
useDeHubVideos({
  unit: 15,
  sortMode: getApiSortMode(selectedSort.value), // 'random' → 'new'
  category: selectedCategory || undefined, // null → undefined
  address: walletAddress || undefined,
})
// Query key: ['dehub-feed', { unit, sortMode, category, address, status: 'minted' }]
```

### MusicFeed Query Key (line 440)
```typescript
queryKey: ['music-videos-infinite', walletAddress]
// Note: walletAddress can be null, not undefined
```

### LiveFeed Query Key (lines 63-66)
```typescript
useDeHubLive({ unit: 15, sortMode: 'recent' })
// Query key: ['dehub-live', { unit: 15, sortMode: 'recent' }]
```

## Expected Result

After this fix:
1. User loads the app → Home feed loads
2. Wallet connects (if returning user)
3. Prefetch runs AFTER wallet state is stable
4. Prefetch warms cache for BOTH public AND authenticated variants
5. User clicks any tab → **Instant load** from cache
6. No loading spinners or data refetching on tab switch

## Verification Steps

1. Open browser DevTools → Network tab
2. Load the app on Home feed
3. Wait for prefetch to complete (watch for multiple API calls)
4. Switch to Videos tab
5. **Expected**: NO new network requests, instant content display
6. Repeat for Images, Shorts, Music, Live tabs
