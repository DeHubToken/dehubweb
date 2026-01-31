

# Plan: Fix DeHub DM (Direct Messages) API Integration

## Problem Analysis

After investigating the codebase, I found several issues with the DM API integration that could cause the Messages page to not work:

### Current Issues Identified

1. **API Response Handling**: The code assumes specific response structures (e.g., `response.result.items`) but doesn't have proper error handling if the API returns different formats
   
2. **Missing Error Logging**: API calls fail silently without adequate logging, making debugging difficult

3. **Endpoint Discrepancies**: Based on the memory context, the DM system uses these endpoints:
   - `GET /api/dm/contacts/{address}` - List conversations
   - `GET /api/dm/search?query=...` - Search conversations (requires non-empty query)
   - `POST /api/dm/tnx` - Send message
   - `PUT /api/dm/tnx` - Mark as read
   
   But the current implementation may have issues with:
   - Response unwrapping (expects `response.result` but API may return differently)
   - Missing or incorrect parameters

4. **JWT Token Parsing**: The code parses the JWT to extract the wallet address, which could fail if the token structure is different

---

## Implementation Plan

### Step 1: Add Comprehensive Logging to DM API Functions
- Add console.log statements to all DM-related API calls
- Log request URLs, parameters, and responses
- Log errors with full context

### Step 2: Fix Response Handling in `getConversations`
- Handle multiple response formats from the API
- Add fallback for when `response.result` is undefined
- Properly handle both array and paginated response formats

### Step 3: Fix Response Handling in `getMessages`  
- Similar fixes for message fetching
- Handle API error responses gracefully

### Step 4: Fix `sendMessage` and `createConversation`
- Verify the request body matches API expectations
- Add proper error handling and logging

### Step 5: Fix `markConversationAsRead`
- Ensure the PUT request body is correct

### Step 6: Update Error States in UI Components
- Show more descriptive error messages in MessagesPage
- Add retry mechanisms

---

## Technical Details

### Files to Modify

1. **`src/lib/api/dehub.ts`** - DM API functions
   - Add logging to: `getConversations`, `getMessages`, `sendMessage`, `createConversation`, `markConversationAsRead`
   - Fix response unwrapping logic
   - Add try-catch blocks with detailed error logging

2. **`src/hooks/use-messages.ts`** - React Query hooks
   - Add better error handling
   - Ensure proper query key invalidation

3. **`src/pages/app/MessagesPage.tsx`** - Messages page component
   - Add better error display
   - Add debug info in development mode

### Key Code Changes

**In `getConversations` function:**
```typescript
export async function getConversations(
  page: number = 0,
  limit: number = 20,
  searchQuery?: string
): Promise<{ items: DeHubConversation[]; totalCount: number; hasMore: boolean }> {
  console.log('[DM API] getConversations called', { page, limit, searchQuery });
  
  // ... existing code with added logging
  
  const response = await apiCall<...>(endpoint, options);
  console.log('[DM API] getConversations response:', response);
  
  // Handle various response formats
  if (response && Array.isArray(response)) {
    return { items: response, totalCount: response.length, hasMore: response.length >= limit };
  }
  if (response?.result && Array.isArray(response.result)) {
    return { items: response.result, totalCount: response.result.length, hasMore: response.result.length >= limit };
  }
  // ... handle other formats
}
```

**Similar changes for:**
- `getMessages()`
- `sendMessage()`
- `createConversation()`
- `markConversationAsRead()`

---

## Testing Recommendations

After implementation:
1. Open browser DevTools Console
2. Navigate to Messages page
3. Look for `[DM API]` prefixed log entries
4. Check if API calls are being made and what responses are returned
5. Try starting a new conversation and sending a message
6. Verify error messages are helpful if something fails

