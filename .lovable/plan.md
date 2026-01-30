
# Fix "Who to Follow" - Continuous User Loading

## Problem
The "Who to Follow" panel only fetches 100 posts from a single page and extracts a maximum of 50 unique users. Once you follow all these users, the list shows "No suggestions yet" instead of loading more users from additional pages.

## Solution
Implement multi-page fetching that continues loading until we have enough unfollowed users to display, removing the artificial 50-user cap.

---

## Technical Changes

### File: `src/components/app/WhoToFollow.tsx`

**1. Multi-page fetching loop**
Replace the single-page fetch with a loop that:
- Fetches 100 posts per page
- Extracts all unique users (no 50-user cap)
- Continues fetching up to 20 pages (2000 posts) to gather a large user pool
- Stops early if a page returns fewer results than requested

**2. Remove artificial limits**
- Delete the `if (uniqueUsers.length >= 50) break;` line
- Collect ALL unique users across all fetched pages

**3. Data flow**
```text
Current:
  Page 0 (100 posts) → Max 50 users → Filter → Often 0 remaining

New:
  Pages 0-19 (up to 2000 posts) → All unique users (200-500+) → Filter → Always have suggestions
```

**4. Query function update**
```typescript
queryFn: async () => {
  const seenAddresses = new Set<string>();
  const uniqueUsers: UniqueUser[] = [];
  const maxPages = 20;
  const pageSize = 100;
  
  for (let page = 0; page < maxPages; page++) {
    const response = await searchNFTs({ 
      sortMode: 'new', 
      unit: pageSize,
      page 
    });
    
    const posts = response.data || [];
    
    for (const nft of posts) {
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
    
    // Stop if we got fewer results (no more data)
    if (posts.length < pageSize) break;
  }
  
  return uniqueUsers;
}
```

This ensures the panel always has users to suggest until you've literally followed everyone on the platform.
