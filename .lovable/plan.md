

# Fix DeHub DM API - Correct Parameter Usage

## Problem Summary

The DM feature is broken due to two API issues:

1. **Conversations not loading**: The `/api/dm/search` endpoint returns a 500 error with `"$regex has to be a string"` because the `query` parameter is missing
2. **User search not working**: The search function may not be calling the correct endpoint

## Root Cause

The API error response:
```json
{"message":"Failed to fetch users","error":"$regex has to be a string"}
```

This indicates `/api/dm/search` requires a `query` parameter for the regex search to work. Currently the code only sends `page` and `limit`.

## Solution

### 1. Fix `getConversations` Function

The `/api/dm/search` endpoint needs a `query` parameter. For listing all conversations, we should pass an empty string:

**Current code (broken):**
```typescript
return apiCall("/api/dm/search", {
  params: { page, limit },
  requiresAuth: true,
});
```

**Fixed code:**
```typescript
return apiCall("/api/dm/search", {
  params: { query: "", page, limit },  // Add query parameter
  requiresAuth: true,
});
```

### 2. Add Search Parameter Support

Update the function to optionally accept a search query:

```typescript
export async function getConversations(
  page: number = 0,
  limit: number = 20,
  searchQuery: string = ""  // Add search query parameter
): Promise<{ items: DeHubConversation[]; totalCount: number; hasMore: boolean }> {
  const response = await apiCall<ConversationsApiResponse>("/api/dm/search", {
    params: { query: searchQuery, page, limit },
    requiresAuth: true,
  });
  return response.result || { items: [], totalCount: 0, hasMore: false };
}
```

### 3. Fix User Search for New Conversations

The current `searchUsersForDM` uses `/api/search_users`. We should verify this endpoint works, or use the existing `searchUsers` function that's used elsewhere in the app.

Looking at the API docs, the options are:
- `/api/search_users?q={query}` - General user search
- `/api/dm/contacts/{address}` - Get contacts for a specific user (not for searching)

We should use `/api/search_users` with proper parameters.

### 4. Update the Hooks

The `useConversations` hook should pass the search query to the API instead of doing client-side filtering:

**Current approach (client-side filter):**
```typescript
const filteredConversations = query.data?.filter((conv) => {
  // Client-side search
});
```

**Better approach (server-side search):**
```typescript
const query = useQuery({
  queryFn: async () => {
    const response = await getConversations(0, 50, searchQuery);
    return response.items || [];
  },
});
```

## Files to Change

| File | Change |
|------|--------|
| `src/lib/api/dehub.ts` | Add `query` param to `getConversations`, fix param names |
| `src/hooks/use-messages.ts` | Update `useConversations` to pass search to API |

## Technical Notes

- The `query` parameter must be a string (even empty `""`) for the regex to work
- The API uses MongoDB's `$regex` operator internally
- All other DM endpoints (`/api/dm/messages/{id}`, `/api/dm/tnx`) should work once we can load conversations

## Expected Outcome

After this fix:
1. Conversations will load when you open the Messages page
2. Searching conversations will work server-side
3. User search for new conversations will return results
4. You'll be able to select a user and start a DM

