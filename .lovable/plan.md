

## Investigation: Home Feed Failing to Load

### Root Cause Identified

The home feed fails to load on non-fresh sessions because of **stale filter state persisted in sessionStorage** combined with **aggressive TanStack Query caching that prevents refetching**.

Here is what happens step by step:

1. User browses the home feed and selects filters (e.g., category "Advertising", W2E toggle on)
2. These filters are saved to `sessionStorage` via `usePersistedFeedFilter`
3. User navigates away or the app hot-reloads
4. On return, the persisted filters are restored from `sessionStorage`
5. The feed query fires with `category=Advertising&hasBounty=true` -- returning **0 results**
6. TanStack Query caches this empty result with `staleTime: 5 min` and `gcTime: 60 min`
7. `refetchOnMount: false` means it never re-fetches even when the component re-mounts
8. `placeholderData: (previousData) => previousData` keeps showing old cached empty data
9. The auto-retry hook (`useAutoRetryFeed`) retries 3 times but keeps hitting the same empty-result query with the same restrictive filters
10. Result: permanently empty feed until cache is cleared

On a fresh browser, `sessionStorage` is empty, so all filters default to "all"/"latest" with no content filters -- and data loads fine.

### The Fix (3 changes)

#### 1. Reset persisted filters on app cold start (localStorage flag)
Add a "session boundary" check: on app mount, if a fresh page load is detected (not a React navigation), clear the persisted feed filters. This ensures users always start with clean defaults when they open/refresh the app, while filters still persist during in-session navigation.

**File:** `src/components/app/feeds/HomeFeed.tsx` (and/or a shared init location)

Add at the top of the HomeFeed component (or in the app shell):
```typescript
useEffect(() => {
  const isNewPageLoad = !sessionStorage.getItem('feed-session-active');
  if (isNewPageLoad) {
    clearPersistedFeedFilters();
    sessionStorage.setItem('feed-session-active', 'true');
  }
}, []);
```

This way filters persist during tab navigation within the app but reset on actual page reload/new tab.

#### 2. Enable `refetchOnMount` in the unified feed hook
Change `refetchOnMount: false` to `refetchOnMount: 'always'` (or just remove the line) so that when the HomeFeed component mounts, it always fires a fresh API call instead of relying on potentially stale cached empty results.

**File:** `src/hooks/use-unified-feed.ts` (line 442)

```typescript
// Before:
refetchOnMount: false,

// After:
refetchOnMount: true,
```

#### 3. Lower `gcTime` to prevent stale empty caches persisting too long
Reduce `gcTime` from 60 minutes to 10 minutes so empty/stale query caches are garbage collected faster.

**File:** `src/hooks/use-unified-feed.ts` (line 440)

```typescript
// Before:
gcTime: 1000 * 60 * 60,  // 60 min

// After:
gcTime: 1000 * 60 * 10,  // 10 min
```

### Summary

| Problem | Fix |
|---------|-----|
| Persisted filters restore restrictive params that return 0 results | Clear persisted filters on fresh page load |
| `refetchOnMount: false` prevents fresh data on revisit | Set `refetchOnMount: true` |
| Empty cache lives for 60 min blocking recovery | Reduce `gcTime` to 10 min |

### Technical Details

- `usePersistedFeedFilter` stores to `sessionStorage` under key `feed-filter-states`
- The network logs confirm the feed request used `category=Advertising&hasBounty=true` which are leftover filter values
- The auto-retry mechanism retries with the same bad params so it never recovers
- `placeholderData: (previousData) => previousData` makes TanStack Query show stale data instead of loading states, masking the problem

