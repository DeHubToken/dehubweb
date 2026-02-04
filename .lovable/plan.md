

# Fix Single-Letter Username Search for @d

## Problem Identified

When searching for `d`, the user `@d` doesn't appear because:

1. **Exact username lookup never fires**: The `useDeHubUserSearch` hook only triggers when the query starts with `@` (e.g., `@d`). When searching plain `d`, it skips the exact user lookup entirely.

2. **API may not return exact matches**: The DeHub `/api/search?type=accounts&q=d` endpoint relies on its internal relevance algorithm, which may not prioritize or even include the exact username `d` in results.

3. **The sorting logic helps, but only if `@d` is in the results**: The client-side sorting correctly prioritizes exact handle matches, but if `@d` never makes it into the results array, sorting can't help.

---

## Solution

Modify `useDeHubUserSearch` to perform exact username lookups for **all short queries (1-2 characters)**, not just queries starting with `@`. This will call the `/api/account_info/d` endpoint directly, which returns the exact user if they exist.

---

## Implementation Steps

### 1. Update `useDeHubUserSearch` hook

**File:** `src/hooks/use-dehub-user-search.ts`

**Changes:**
- Add a new optional parameter `forceExactLookup` that bypasses the `@` prefix requirement
- When `forceExactLookup` is true, treat the raw query as a username and perform the exact lookup
- Reduce minimum character requirement from 2 to 1 for exact lookups

```typescript
export interface UseDeHubUserSearchOptions {
  query: string;
  enabled?: boolean;
  forceExactLookup?: boolean; // NEW: bypass @ requirement
}

export function useDeHubUserSearch({ 
  query, 
  enabled = true,
  forceExactLookup = false, // NEW
}: UseDeHubUserSearchOptions) {
  const debouncedQuery = useDebouncedValue(query, 300);
  
  const isUsernameQuery = debouncedQuery.trim().startsWith('@');
  const cleanUsername = debouncedQuery.trim().replace(/^@/, '').trim();
  
  // Enable for @ queries with 1+ chars, OR for forced lookups with 1+ chars
  const shouldFetch = enabled && cleanUsername.length >= 1 && (
    isUsernameQuery || forceExactLookup
  );
  // ...
}
```

### 2. Update ExplorePage to use exact lookup for short queries

**File:** `src/pages/app/ExplorePage.tsx`

**Changes:**
- Pass `forceExactLookup: true` when performing short searches (1-2 characters)
- This ensures typing `d` will call `/api/account_info/d` to find `@d` directly

```typescript
const {
  data: exactUser,
  isLoading: isUserLoading,
  isUsernameQuery,
} = useDeHubUserSearch({
  query: effectiveQuery,
  enabled: isSearching && (activeTab === 'all' || activeTab === 'people' || isShortSearch),
  forceExactLookup: isShortSearch, // NEW: force exact lookup for 1-2 char queries
});
```

### 3. Update hooks barrel export (if needed)

**File:** `src/hooks/index.ts`

No changes needed - the export already includes the hook.

---

## Technical Details

### How it works after the fix:
1. User types `d`
2. After 1 second debounce, `isShortSearch` becomes true
3. `useDeHubUserSearch` fires with `forceExactLookup: true`
4. Hook calls `/api/account_info/d` 
5. If user `@d` exists, they're returned as `exactUser`
6. In `searchResults` memo, `exactUser` is added to `peopleResults`
7. The sorting ensures `@d` appears at the top (exact match)

### Edge cases handled:
- User doesn't exist: API returns 404, query fails with `retry: false`, no result shown
- User types `@d`: Works as before (isUsernameQuery is true)
- User types `da`: Also triggers exact lookup for `@da` if it exists

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/use-dehub-user-search.ts` | Add `forceExactLookup` parameter, allow 1-char lookups |
| `src/pages/app/ExplorePage.tsx` | Pass `forceExactLookup: isShortSearch` to the hook |

