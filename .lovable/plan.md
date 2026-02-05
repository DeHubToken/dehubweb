
# Fix Search to Find All Users on "All" Tab

## Problem Summary

When searching for "malik" on the "All" tab, only 1 user appears because:

1. The search API (`/api/search`) requires a `type` parameter to search users
2. Without `type=accounts`, the API only searches content/posts
3. The only user shown comes from an exact username lookup (`/api/account_info/malik`), not from the actual search

## Root Cause

The API behaves differently based on the `type` parameter:
- `type=accounts` → Returns matching users
- `type=videos` or no type → Returns matching content/posts only

Currently on the "All" tab:
- `getTypeForTab('all')` returns `undefined`
- Only one search call is made without `type`, returning only content
- Users are not searched via the main search API

## Solution

For the "All" tab, run **parallel searches** for both accounts and content, then merge results.

### Changes Required

**1. Update `src/pages/app/ExplorePage.tsx`**

Add a second search query specifically for accounts when on the "All" tab:

```text
// Existing search for content (when tab is 'all', this searches content only)
const {
  data: searchData,
  // ... 
} = useDeHubSearch({
  query: effectiveQuery,
  type: effectiveSearchType,  // undefined for 'all' tab
  // ...
});

// NEW: Additional search for accounts when on 'All' tab
const {
  data: accountSearchData,
} = useDeHubSearch({
  query: effectiveQuery,
  type: 'accounts',  // Always search accounts
  enabled: isSearching && (activeTab === 'all'),  // Only when 'All' tab is active
  minQueryLength: isShortSearch ? 1 : 3,
});
```

**2. Merge account results into `searchResults`**

Update the `useMemo` that builds `searchResults` to also include accounts from the new `accountSearchData`:

```text
const searchResults = useMemo(() => {
  // Get accounts from universal search (people tab)
  const accounts = flattenSearchAccounts(searchData) || [];
  
  // NEW: Also get accounts from dedicated account search (for All tab)
  const allTabAccounts = flattenSearchAccounts(accountSearchData) || [];
  
  // Merge account sources
  const combinedAccounts = [...accounts, ...allTabAccounts];
  
  // ... rest of the existing logic to dedupe and sort
}, [searchData, accountSearchData, exactUser, brandUser, isShortSearch, effectiveQuery]);
```

## Technical Details

### Files to Modify
- `src/pages/app/ExplorePage.tsx` - Add second search hook and merge logic

### Why This Works
- Running two parallel searches (one for content, one for accounts) mirrors what the API expects
- Results are merged and deduplicated using the existing Map-based deduplication
- No changes needed to the API layer or search hook

## Expected Outcome

After this fix:
- Searching "malik" on "All" tab will show all users with "malik" in their username (malik, dehub-malik, malik_dehub, malikjan, etc.)
- Searching "mal" will show even more users matching "mal*"
- Content and user results will be properly combined on the "All" tab
