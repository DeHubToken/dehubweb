

# Fix DeHub DM API Endpoints

## Problem Identified
The messaging feature is broken because the API endpoints were incorrectly guessed. The current code uses `/api/conversations` but the actual DeHub API uses `/api/dm/` prefix.

## Correct Endpoint Mapping

Based on the API documentation screenshot:

| Feature | Current (Wrong) | Correct Endpoint |
|---------|----------------|------------------|
| List/Search DMs | `/api/conversations` | `GET /api/dm/search` |
| Get conversation | `/api/conversations/{id}` | `GET /api/dm/{id}` |
| Get messages | `/api/conversations/{id}/messages` | `GET /api/dm/messages/{id}` |
| Send message | `POST /api/conversations/{id}/messages` | `POST /api/dm/tnx` |
| Create conversation | `POST /api/conversations` | `POST /api/dm/tnx` (with new recipient) |
| Delete messages | `DELETE /api/conversations/{id}` | `POST /api/dm/delete-messages` |
| User contacts | `/api/users/search` | `GET /api/dm/contacts/{address}` |
| Mark as read | `PUT /api/conversations/{id}/read` | `PUT /api/dm/tnx` |
| User status | N/A | `GET /api/dm/user-status/{address}` |

## Implementation Changes

### 1. Update `src/lib/api/dehub.ts`

Update all messaging API functions to use correct endpoints:

```typescript
// List conversations - use /api/dm/search
export async function getConversations(page: number = 0, limit: number = 20) {
  return apiCall("/api/dm/search", {
    params: { page, limit },
    requiresAuth: true,
  });
}

// Get single conversation - use /api/dm/{id}
export async function getConversation(conversationId: string) {
  return apiCall(`/api/dm/${conversationId}`, { requiresAuth: true });
}

// Get messages - use /api/dm/messages/{id}
export async function getMessages(conversationId: string, page: number = 0, limit: number = 30) {
  return apiCall(`/api/dm/messages/${conversationId}`, {
    params: { page, limit },
    requiresAuth: true,
  });
}

// Send message - use /api/dm/tnx
export async function sendMessage(conversationId: string, content: string, type = 'text', mediaUrl?: string) {
  return apiCall("/api/dm/tnx", {
    method: "POST",
    body: { conversationId, content, type, mediaUrl },
    requiresAuth: true,
  });
}

// Get contacts for DM - use /api/dm/contacts/{address}
export async function searchUsersForDM(query: string, page: number = 0, limit: number = 10) {
  return apiCall(`/api/dm/contacts/${query}`, {
    params: { page, limit },
    requiresAuth: true,
  });
}

// Delete messages - use /api/dm/delete-messages
export async function deleteConversation(conversationId: string) {
  return apiCall("/api/dm/delete-messages", {
    method: "POST",
    body: { conversationId },
    requiresAuth: true,
  });
}

// Update/mark read - use PUT /api/dm/tnx
export async function markConversationAsRead(conversationId: string) {
  return apiCall("/api/dm/tnx", {
    method: "PUT",
    body: { conversationId, read: true },
    requiresAuth: true,
  });
}
```

### 2. Update Response Handling

The API response structure may differ from assumptions. Will need to:
- Inspect actual response format from `/api/dm/search`
- Adjust interface types if needed (e.g., field names like `result` vs direct data)
- Handle any differences in conversation/message object structure

### 3. Update User Search for New Conversation

The `NewConversationModal` uses `searchUsersForDM` which currently calls `/api/users/search`. Options:
- Use `/api/dm/contacts/{address}` if it supports search
- Use the existing `searchUsers` function from the main API if available
- Fallback to the general user search endpoint

## Files to Change

| File | Changes |
|------|---------|
| `src/lib/api/dehub.ts` | Update all 7 messaging functions to use correct `/api/dm/*` endpoints |
| `src/hooks/use-messages.ts` | May need minor adjustments if response structure differs |
| `src/components/app/chat/NewConversationModal.tsx` | Update user search if endpoint changes |

## Technical Notes

- All endpoints require authentication (`requiresAuth: true`)
- The `tnx` endpoint appears to be used for both sending messages (POST) and updating read status (PUT)
- May need to test actual API responses to confirm exact field names
- Upload media uses separate `/api/dm/upload` endpoint for images/files

