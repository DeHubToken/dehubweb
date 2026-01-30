

# Fix DeHub DM API - Corrected Endpoint Usage

## Problem Analysis

Based on the network logs, the `/api/dm/search` endpoint is returning a **500 Internal Server Error**:
```json
{"message":"Failed to fetch users","error":"$regex has to be a string"}
```

This error occurs even when passing `query=""` (empty string) as a URL parameter (`?query=&page=0&limit=50`). The issue is that the API's MongoDB backend receives empty query params as `null`/`undefined`, breaking the `$regex` operator.

## Root Causes

1. **Wrong endpoint for listing conversations**: The `/api/dm/search` endpoint is designed for **searching** conversations by query, not listing all conversations. We need to use a different endpoint to get the conversation list.

2. **User search endpoint may need adjustment**: The `/api/search_users` endpoint parameters need verification.

## Solution

### 1. Use Different Endpoint Strategy

Based on the API documentation screenshot, here's the corrected approach:

| Purpose | Current (Broken) | Correct Approach |
|---------|------------------|------------------|
| List all DMs | `GET /api/dm/search?query=` | `GET /api/dm/search` with minimum query OR different endpoint |
| Search DMs | `GET /api/dm/search?query=xyz` | Same, but only when user provides a search term |
| Search users | `GET /api/search_users?q=` | Needs non-empty query |

### 2. Code Changes for `src/lib/api/dehub.ts`

**Fix `getConversations` function to handle the API quirk:**

The API requires a **non-empty** query parameter for regex. We have two options:

**Option A**: Only call `/api/dm/search` when there's a search term, and use a different approach for listing:
```typescript
export async function getConversations(
  page: number = 0,
  limit: number = 20,
  searchQuery?: string
): Promise<{ items: DeHubConversation[]; totalCount: number; hasMore: boolean }> {
  // If no search query, we can't use /api/dm/search - try alternative
  // Option: Use /api/dm/contacts/{address} with current user's address
  if (!searchQuery) {
    // Try to get from contacts endpoint or return empty for now
    const token = getAuthToken();
    if (!token) return { items: [], totalCount: 0, hasMore: false };
    
    // Parse user address from JWT token
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userAddress = payload.address;
    
    const response = await apiCall<{ result: DeHubConversation[] }>(`/api/dm/contacts/${userAddress}`, {
      params: { page, limit },
      requiresAuth: true,
    });
    
    const items = Array.isArray(response.result) ? response.result : [];
    return { items, totalCount: items.length, hasMore: items.length >= limit };
  }
  
  // With search query, use search endpoint
  const response = await apiCall<ConversationsApiResponse>("/api/dm/search", {
    params: { query: searchQuery, page, limit },
    requiresAuth: true,
  });
  return response.result || { items: [], totalCount: 0, hasMore: false };
}
```

**Option B**: Pass a wildcard or special character as query:
```typescript
// Some MongoDB implementations accept ".*" as a "match all" regex
params: { query: searchQuery || ".*", page, limit }
```

### 3. Fix `searchUsersForDM` function

The `/api/search_users` endpoint requires a non-empty query. The hook already guards against calling with less than 2 characters, but we should also handle the response format better:

```typescript
export async function searchUsersForDM(
  query: string,
  page: number = 0,
  limit: number = 10
): Promise<{ items: DeHubUser[]; hasMore: boolean }> {
  if (!query || query.length < 2) {
    return { items: [], hasMore: false };
  }
  
  const response = await apiCall<{ result: DeHubUser[] | { items: DeHubUser[]; hasMore: boolean } }>(
    "/api/search_users",
    {
      params: { q: query, page, limit },
      requiresAuth: true,
    }
  );
  
  // Handle both response formats
  if (Array.isArray(response.result)) {
    return { 
      items: response.result, 
      hasMore: response.result.length >= limit 
    };
  }
  
  return response.result || { items: [], hasMore: false };
}
```

### 4. Update `src/hooks/use-messages.ts`

Update the hook to handle the case where no conversations exist yet:

```typescript
export function useConversations(searchQuery: string = '') {
  const { isAuthenticated } = useAuth();
  
  const query = useQuery({
    queryKey: [...messagesKeys.conversations(), searchQuery],
    queryFn: async () => {
      const response = await getConversations(0, 50, searchQuery || undefined);
      return response.items || [];
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    retry: 1, // Don't retry too many times on API errors
  });
  // ...
}
```

## Files to Change

| File | Change |
|------|--------|
| `src/lib/api/dehub.ts` | Update `getConversations` to use `/api/dm/contacts/{address}` for listing, only use `/api/dm/search` when there's an actual query |
| `src/lib/api/dehub.ts` | Update `searchUsersForDM` to guard against empty queries |
| `src/hooks/use-messages.ts` | Pass `undefined` instead of empty string, add retry limit |

## Technical Notes

- The `/api/dm/search` endpoint is meant for **searching** conversations, not listing them
- The `/api/dm/contacts/{address}` endpoint returns contacts/conversations for a user
- We need to extract the user's address from the JWT token to call the contacts endpoint
- Empty string URL parameters get coerced to `null` by the API, breaking MongoDB's `$regex`

## Expected Outcome

After this fix:
1. Conversations will load correctly when opening Messages page
2. Search will only call the search endpoint when the user types something
3. User search for new conversations will work properly

