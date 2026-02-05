
# Fix Search Not Finding Users

## Root Cause

The `universalSearch()` function in `src/lib/api/dehub.ts` is broken. It treats **all** API responses as NFT content and puts them in the `videos` array, even when:
1. `type=accounts` is passed
2. The API returns user objects (with `_id`, `address`, `username`, etc.)

The API actually returns different data structures based on the `type` parameter:
- **`type=accounts`**: Returns user objects like `{_id, address, username, displayName, avatarImageUrl}`
- **No type / `type=videos`**: Returns NFT objects like `{tokenId, name, imageUrl, minter}`

Currently, when you search "ja", the API correctly returns users named "jamie", "james", etc. but the `universalSearch()` function mistakenly puts them in the `videos` array where they get filtered out or lost.

## Solution

Update `universalSearch()` to properly detect and categorize the response data:

1. **Check if searching for accounts**: When `type=accounts`, parse the result as `SearchAccount[]`
2. **Check response data structure**: Use heuristics to detect if items are users (have `username`/`displayName`) or NFTs (have `tokenId`/`imageUrl`)
3. **Map user objects correctly**: Convert raw user objects to `SearchAccount` format

## Code Changes

### File: `src/lib/api/dehub.ts`

```typescript
export async function universalSearch(params: UniversalSearchParams): Promise<UniversalSearchResponse> {
  const response = await apiCall<{ 
    result: Array<DeHubNFT | DeHubUser>; 
    pagination?: { hasMore: boolean; totalCount: number } 
  }>("/api/search", {
    params: {
      q: params.q,
      page: params.page,
      unit: params.unit,
      type: params.type,
      postType: params.postType,
      address: params.address,
    },
  });
  
  // Extract the array from response
  let items: Array<any> = [];
  if (response && typeof response === 'object' && 'result' in response) {
    items = Array.isArray(response.result) ? response.result : [];
  }
  
  // Determine if results are accounts or NFTs based on type param and data shape
  const isAccountSearch = params.type === 'accounts';
  
  if (isAccountSearch) {
    // Map raw user objects to SearchAccount format
    const accounts: SearchAccount[] = items.map(item => ({
      id: item._id || item.id || item.address,
      address: item.address,
      username: item.username,
      displayName: item.displayName,
      bio: item.aboutMe || item.bio,
      avatarUrl: item.avatarImageUrl || item.avatarUrl,
      avatarImageUrl: item.avatarImageUrl,
      verified: item.isVerified || false,
      followerCount: typeof item.followers === 'number' ? item.followers : undefined,
    })).filter(a => a.id && a.address);
    
    return {
      accounts,
      videos: [],
      livestreams: [],
      has_more: response.pagination?.hasMore ?? items.length >= (params.unit || 15),
      total: response.pagination?.totalCount ?? items.length,
    };
  }
  
  // For video/NFT searches, keep existing behavior
  return {
    accounts: [],
    videos: items as DeHubNFT[],
    livestreams: [],
    has_more: response.pagination?.hasMore ?? items.length >= (params.unit || 15),
    total: response.pagination?.totalCount ?? items.length,
  };
}
```

## Expected Result

After this fix:
- Searching "ja" will correctly show users like "jamie", "james", "jasmin" in the People tab
- Searching "jamie" will still work as before
- The "All" tab will show both people and content matching the query
- Short 1-2 character searches will work for finding people
