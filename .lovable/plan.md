

# Plan: Fix Likes Not Registering

## Problem Diagnosis

After thorough investigation, I found **two distinct issues** causing likes to not work:

### Issue 1: Missing `address` Query Parameter
The feed API requests are NOT including the user's wallet `address` as a query parameter:
- **Current URL**: `GET /api/feed?page=1&limit=12&postType=video&sortBy=createdAt&sortOrder=desc&status=minted`
- **Missing**: `&address=0xf3ede20ac...` 

Without the `address` parameter, the DeHub API cannot return personalized `isLiked`/`isDisliked` fields in the feed response. The JWT token alone contains the address but the API appears to require the explicit query parameter.

### Issue 2: Feed Cache Not Invalidated on Auth Change
When the user logs in, the feed data is cached by React Query. The cached data was fetched before authentication (without address), so it doesn't contain vote state. The cache isn't being invalidated when auth state changes.

## Solution

### Step 1: Force Address in Feed Queries
Modify `VideosFeed.tsx` and other feed components to:
- Only enable feed queries when authentication state is resolved
- Include `walletAddress` in the query key so cache is invalidated on login/logout
- Ensure the `address` parameter is always passed when user is authenticated

### Step 2: Add Debug Logging to voteOnNFT
Add console logging to the vote function to help debug any remaining issues:
- Log the request being sent
- Log the response received
- Log any errors with full details

### Step 3: Invalidate Feed Cache on Auth Change
Add cache invalidation in `AuthContext.tsx` to clear feed data when user logs in/out, ensuring fresh data with proper vote state.

---

## Technical Details

### Files to Modify

1. **`src/components/app/feeds/VideosFeed.tsx`**
   - Add `walletAddress` to the query key in `useUnifiedFeed`
   - Ensure feed re-fetches when auth state changes

2. **`src/hooks/use-unified-feed.ts`**
   - Add `address` to the query key
   - Add debug logging for address parameter

3. **`src/lib/api/dehub.ts`**
   - Add debug logging to `voteOnNFT` function to trace API calls

4. **`src/contexts/AuthContext.tsx`**
   - Invalidate feed queries when user successfully authenticates

### Key Code Changes

**use-unified-feed.ts - Add address to query key:**
```typescript
return useInfiniteQuery({
  queryKey: ['unified-feed', params, limit, params.address], // Include address for cache invalidation
  ...
});
```

**VideosFeed.tsx - Ensure address is passed:**
```typescript
const { walletAddress, isAuthenticated } = useAuth();

// The hook already passes address, but ensure query key updates on auth change
```

**voteOnNFT - Add debug logging:**
```typescript
export async function voteOnNFT(tokenId: string, vote: boolean): Promise<VoteResponse> {
  console.log('[Vote] Calling API:', { tokenId, vote });
  const result = await apiCall<VoteResponse>(...);
  console.log('[Vote] API Response:', result);
  return result;
}
```

---

## Expected Outcome

After these changes:
1. Feed data will include `isLiked`/`isDisliked` for authenticated users
2. Vote API calls will be properly logged for debugging
3. Cache will be invalidated on login, fetching fresh personalized data
4. Like button state will persist correctly after voting

