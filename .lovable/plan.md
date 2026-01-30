
# Progressive Loading for "Who to Follow"

## Problem
The parallel batch approach still waits for ALL batches to complete before displaying results. If a user has followed everyone from the first 500 users, they see "loading" until all 2000 posts are fetched.

## Solution
Split into two queries with **instant display + background enrichment**:
1. **Fast query**: Fetch first 5 pages in parallel → show results immediately
2. **Background query**: Fetch remaining pages → merge into list as they complete

---

## Technical Changes

### File: `src/components/app/WhoToFollow.tsx`

**1. Create two separate queries**

```typescript
// Fast initial load (pages 0-4)
const { data: initialUsers, isLoading: isLoadingInitial } = useQuery({
  queryKey: ['suggestions', 'initial'],
  queryFn: () => fetchUserBatch(0, 5), // Pages 0-4 in parallel
  staleTime: 5 * 60 * 1000,
});

// Background extended load (pages 5-19)
const { data: extendedUsers } = useQuery({
  queryKey: ['suggestions', 'extended'],
  queryFn: () => fetchUserBatch(5, 20), // Pages 5-19 in parallel
  enabled: !!initialUsers, // Only start after initial loads
  staleTime: 5 * 60 * 1000,
});
```

**2. Merge results progressively**

```typescript
const allUsers = useMemo(() => {
  const users = [...(initialUsers || [])];
  const seenAddresses = new Set(users.map(u => u.address));
  
  // Add extended users that aren't duplicates
  for (const user of (extendedUsers || [])) {
    if (!seenAddresses.has(user.address)) {
      seenAddresses.add(user.address);
      users.push(user);
    }
  }
  
  return users;
}, [initialUsers, extendedUsers]);
```

**3. Extract shared fetch function**

```typescript
async function fetchUserBatch(startPage: number, endPage: number) {
  const seenAddresses = new Set<string>();
  const uniqueUsers: UniqueUser[] = [];
  const pageSize = 100;
  
  // Fetch all pages in parallel
  const pagePromises = [];
  for (let page = startPage; page < endPage; page++) {
    pagePromises.push(searchNFTs({ sortMode: 'new', unit: pageSize, page }));
  }
  
  const results = await Promise.all(pagePromises);
  
  for (const response of results) {
    for (const nft of (response.data || [])) {
      const address = nft.minter;
      if (!address || seenAddresses.has(address)) continue;
      seenAddresses.add(address);
      uniqueUsers.push({
        address,
        username: nft.mintername,
        displayName: nft.minterDisplayName,
        avatarUrl: nft.minterAvatarUrl,
      });
    }
  }
  
  return uniqueUsers;
}
```

**4. Show loading only for initial fetch**

```typescript
if (isLoadingInitial) {
  return <Loader2 className="animate-spin" />;
}
// Show results immediately once initial load completes
// Extended results appear automatically as they load
```

## User Experience

| Scenario | Before | After |
|----------|--------|-------|
| Fresh user | Wait 10s+ for all data | See results in ~1s |
| Followed 50 users | Wait 10s+ | See remaining in ~1s |
| Followed 200+ users | Wait 10s+ | See initial in ~1s, more appear as background loads |

Users always see available suggestions within ~1 second, and the list grows as more data loads in the background.
