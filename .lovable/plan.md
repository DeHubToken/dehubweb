
# Plan: Fix Followers/Likes/Subscribers Leaderboard Categories

## Problem Identified

The "Followers", "Likes", and "Subscribers" leaderboard tabs don't work correctly because:

1. **They use the wrong API sort** - All three categories use `apiSort: 'holdings'`, meaning they fetch Holdings data instead of data sorted by their respective metrics
2. **The DeHub API only supports 3 sort modes** - `holdings`, `sentTips`, `receivedTips`
3. **No client-side sorting** - Even if the entries contain `followers`/`likes`/`subscribers` fields, the list isn't re-sorted on the client

## Solution Options

### Option A: Client-Side Re-Sorting (Quick Fix)
If the API returns `followers`, `likes`, `subscribers` fields in the Holdings response, we can:
- Keep fetching from Holdings endpoint
- Re-sort the entries client-side based on the selected category
- Filter out entries with 0 or undefined values for that metric

### Option B: Check API for Additional Sort Modes
The DeHub API may support `followers`, `likes`, `subscribers` as sort modes. We should:
- Update `LeaderboardSortMode` type to include these
- Update edge function to cache these combinations
- Update category mappings to use correct `apiSort` values

### Option C: Remove Unsupported Categories (Safe Fix)
If the API doesn't support these sort modes and doesn't return these fields reliably:
- Remove "Followers", "Likes", "Subscribers" tabs
- Only show the 3 working categories

## Recommended Approach: Option A + Validation

Since we're unsure what the API returns, implement client-side sorting first:

### Changes Required

**File: `src/pages/app/LeaderboardPage.tsx`**

1. **Add client-side sorting logic** in the `entries` useMemo:
```typescript
const entries = useMemo(() => {
  let list = data?.result?.byWalletBalance || [];
  
  // Filter out wallet-only entries (no username)
  list = list.filter(entry => entry.username);
  
  // Sort by selected category
  if (category === 'followers') {
    list = [...list].sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
  } else if (category === 'likes') {
    list = [...list].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  } else if (category === 'subscribers') {
    list = [...list].sort((a, b) => (b.subscribers ?? 0) - (a.subscribers ?? 0));
  }
  
  // Filter out entries with 0 value for the selected metric
  if (['followers', 'likes', 'subscribers'].includes(category)) {
    list = list.filter(entry => (entry[category as keyof LeaderboardEntry] ?? 0) > 0);
  }
  
  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    list = list.filter((entry) => 
      entry.username?.toLowerCase().includes(query) ||
      entry.userDisplayName?.toLowerCase().includes(query) ||
      entry.account.toLowerCase().includes(query)
    );
  }
  
  return list;
}, [data, searchQuery, category]);
```

2. **Disable time period filters for client-sorted categories** - Since the Holdings data is for "all time", time period filters won't work correctly for Followers/Likes/Subscribers when client-side sorting

### Technical Details

| Category | Current Behavior | Fixed Behavior |
|----------|------------------|----------------|
| Holdings | Works correctly | No change |
| Sent Tips | Works correctly | No change |
| Paid Tips | Works correctly | No change |
| Followers | Shows Holdings data | Re-sorts by `followers` field |
| Likes | Shows Holdings data | Re-sorts by `likes` field |
| Subscribers | Shows Holdings data | Re-sorts by `subscribers` field |

### Edge Cases to Handle
- Entries with `undefined` or `0` values for the metric should be filtered out
- Time period selector should be hidden/disabled for client-sorted categories
- Show "No data available" if no entries have the required metric

### Files to Modify
1. `src/pages/app/LeaderboardPage.tsx` - Add client-side sorting and filtering logic
