

# Plan: Make VideosFeed "Most Liked" Show All-Time Rankings

## Problem

The Videos feed "Most Liked" sort doesn't match the Home feed's behavior:
- **Home feed**: "Most Liked" ignores the date filter and shows all-time most liked content
- **Videos feed**: "Most Liked" still applies whatever date filter is selected (e.g., "This Week"), limiting results to that time range

## Root Cause

In `VideosFeed.tsx`, the `range` parameter is always derived from `selectedUploadDate`, regardless of the sort type:

```typescript
// Current behavior - always applies date filter
range: getUnifiedRange(selectedUploadDate.value),
```

In `HomeFeed.tsx`, the range is conditionally removed for global sorts:

```typescript
// HomeFeed correctly ignores date for global sorts
const range = useMemo(() => {
  if (selectedSort.value === 'trending' || selectedSort.value === 'following') {
    return undefined; // No range limit
  }
  return getDateRange(selectedDate.value);
}, [selectedSort.value, selectedDate.value]);
```

## Solution

Update `VideosFeed.tsx` to ignore the date range when "Most Liked" is selected, matching the Home feed behavior.

## Technical Changes

### File: `src/components/app/feeds/VideosFeed.tsx`

1. **Add conditional range logic** before the `useUnifiedFeed` call:

```typescript
// For "Most Liked", ignore date filter to get true all-time ranking
const effectiveRange = useMemo(() => {
  if (selectedSort.value === 'most-liked') {
    return undefined; // All-time for global ranking
  }
  return getUnifiedRange(selectedUploadDate.value);
}, [selectedSort.value, selectedUploadDate.value]);
```

2. **Update the useUnifiedFeed hook call** to use the new conditional range:

```typescript
useUnifiedFeed({
  // ...other params
  range: effectiveRange, // Changed from getUnifiedRange(selectedUploadDate.value)
  // ...
});
```

## Files to Modify

1. `src/components/app/feeds/VideosFeed.tsx` - Add conditional range logic for "Most Liked" sort

## Expected Behavior After Fix

- **"Most Liked" on Videos tab**: Shows all-time most liked videos, regardless of date filter selection
- **Other sorts** (Latest, Most Viewed, Most Comments): Continue to respect the date filter as before
- **Matches Home feed behavior**: Consistent user experience across tabs

