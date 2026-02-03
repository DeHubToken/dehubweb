
# Immediate Feed Prefetching After Home Feed Loads

## Problem

Currently, when the user loads the home page:
1. Home feed renders and fetches data
2. After 500ms, `isHomeFeedLoaded` is set to `true`
3. After another 1000ms delay (`PREFETCH_DELAY_MS`), prefetch starts
4. Prefetch makes API calls for Videos, Images, Shorts, Music, Live

**Total delay before prefetch starts: ~1.5 seconds**

By the time prefetch completes, the user may have already clicked another tab, causing a loading spinner instead of instant content.

## Solution

Start prefetching **immediately** after the home feed's first page loads, with no artificial delays. This ensures other feeds are cached before the user even thinks about switching tabs.

## Implementation

### File: `src/hooks/use-feed-prefetch.ts`

**Remove the 1000ms delay and trigger prefetch instantly:**

```typescript
// BEFORE (line 21):
const PREFETCH_DELAY_MS = 1000;

// AFTER:
const PREFETCH_DELAY_MS = 0; // Start immediately
```

### File: `src/pages/app/HomePage.tsx`

**Trigger prefetch as soon as home feed data is available, not after an arbitrary 500ms timeout:**

```typescript
// BEFORE (lines 169-174):
useEffect(() => {
  const timer = setTimeout(() => {
    setIsHomeFeedLoaded(true);
  }, 500);
  return () => clearTimeout(timer);
}, []);

// AFTER:
// Remove this useEffect entirely.
// Instead, pass the home feed's isSuccess/data state to useFeedPrefetch
```

**Better approach - use the actual feed loading state:**

```typescript
// In HomePage, we need to know when HomeFeed's data arrives.
// Option 1: Lift the isSuccess state up from HomeFeed
// Option 2: Use a callback from HomeFeed when data loads
// Option 3: Keep it simple - just remove the delays

// SIMPLEST FIX: Just set isHomeFeedLoaded to true immediately on mount
// and let the prefetch hook handle the timing via React Query's staleTime
useEffect(() => {
  setIsHomeFeedLoaded(true);
}, []);
```

### File: `src/hooks/use-feed-prefetch.ts` (complete update)

```typescript
// Key changes:
// 1. Remove PREFETCH_DELAY_MS or set to 0
// 2. Run prefetch immediately when isHomeFeedLoaded is true

const PREFETCH_DELAY_MS = 0; // No delay - start immediately

export function useFeedPrefetch(isHomeFeedLoaded: boolean) {
  const queryClient = useQueryClient();
  const { walletAddress, isConnecting } = useAuth();
  const hasPrefetchedRef = useRef(false);
  
  useEffect(() => {
    if (!isHomeFeedLoaded) return;
    if (isConnecting) return;
    if (hasPrefetchedRef.current) return;
    
    const alreadyPrefetched = sessionStorage.getItem(PREFETCH_DONE_KEY);
    if (alreadyPrefetched) {
      hasPrefetchedRef.current = true;
      return;
    }
    
    // No delay - start immediately (or minimal 50ms to let home render)
    const timeoutId = setTimeout(() => {
      hasPrefetchedRef.current = true;
      sessionStorage.setItem(PREFETCH_DONE_KEY, 'true');
      prefetchAllFeeds(queryClient, walletAddress);
    }, PREFETCH_DELAY_MS);
    
    return () => clearTimeout(timeoutId);
  }, [isHomeFeedLoaded, queryClient, walletAddress, isConnecting]);
}
```

## Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/use-feed-prefetch.ts` | Set `PREFETCH_DELAY_MS = 0` to remove artificial delay |
| `src/pages/app/HomePage.tsx` | Remove 500ms timeout; set `isHomeFeedLoaded = true` immediately on mount |

## Expected Behavior After Fix

1. User opens app → HomePage mounts
2. `isHomeFeedLoaded` is immediately `true`
3. Prefetch waits for `isConnecting` to be `false` (wallet state stable)
4. Prefetch runs immediately (0ms delay)
5. By the time home feed content is visible, other tabs are already being fetched
6. User clicks Videos/Images/Shorts → **Instant load from cache**

## Technical Notes

- React Query's `staleTime: 10 * 60 * 1000` (10 minutes) means prefetched data stays fresh
- Prefetch uses `prefetchInfiniteQuery` which won't block the UI
- Session storage prevents re-prefetching on back navigation
- The wallet `isConnecting` check ensures we prefetch with the correct user context
