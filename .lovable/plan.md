

## Fix: Slow category loading in Talk of the Town

### Root Causes

1. **Nuclear cache clear**: `queryClient.removeQueries({ queryKey: ['unified-feed'] })` destroys ALL cached feed data on every category click. This forces a full API refetch from scratch rather than leveraging React Query's background refetching.

2. **Infinite skeleton bug**: The transitioning flag only clears when `items.length > 0`. If a category has 0 posts, the skeleton spinner shows forever.

3. **Unnecessary full reload for multi-category**: When multiple categories are selected, filtering happens client-side anyway, but we still nuke the cache and force a loading state.

### Solution

Replace the aggressive cache-clearing approach with a smarter strategy:

1. **Use `invalidateQueries` instead of `removeQueries`** — this triggers a background refetch while keeping existing data visible, so the UI stays responsive.
2. **Only force skeleton for single-category API calls** where the server filters (since stale data would show wrong results). For multi-category client-side filtering, skip the skeleton entirely.
3. **Fix the infinite skeleton**: Clear `isCategoryTransitioning` when data has loaded OR when the query is no longer loading, regardless of item count.

### Files to change

| File | Change |
|------|--------|
| `src/components/app/feeds/HomeFeed.tsx` | Replace `removeQueries` with `invalidateQueries` in the category-filter-changed handler. Only set `isCategoryTransitioning` when going from 0 to 1 category (server-filtered). Fix the clear effect to also handle 0-result responses. |

### Technical detail

**Handler change** (line ~361):
```typescript
// Before:
setIsCategoryTransitioning(true);
queryClient.removeQueries({ queryKey: ['unified-feed'] });

// After:
queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
// Only show skeleton when switching to a single server-filtered category
const willBeSingle = /* check if resulting array has exactly 1 item */;
if (willBeSingle) setIsCategoryTransitioning(true);
```

**Clear effect fix** (line ~1250):
```typescript
// Before: only clears when items.length > 0
if (isCategoryTransitioning && hasQueryData && items.length > 0) {

// After: clear when query has resolved (even with 0 results)
if (isCategoryTransitioning && hasQueryData) {
  setIsCategoryTransitioning(false);
}
// Also clear if not loading and no data (empty result)
if (isCategoryTransitioning && !isLoading && !isFetching) {
  setIsCategoryTransitioning(false);
}
```

### Result
- **Before**: 2-5 second skeleton loading on every category click, infinite skeleton on empty categories
- **After**: Existing feed stays visible during refetch; instant filter for multi-category; skeleton only for necessary server-filtered switches; empty categories show "no posts" instead of infinite loading

