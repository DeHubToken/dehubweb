
# Fix DM Message Sending - Use FormData

## Problem
The `/api/dm/upload` endpoint returns "Failed to send file" with error "Cannot read properties of undefined (reading 'toLowerCase')". This is because the endpoint expects **FormData** (multipart form-data), not JSON.

## Root Cause
Currently sending:
```javascript
// Current implementation - WRONG
await apiCall<any>("/api/dm/upload", {
  method: "POST",
  body: { content, type, receiverAddress },  // JSON body
  requiresAuth: true,
});
```

But the endpoint expects FormData like the profile update endpoint does.

## Solution

### Step 1: Update sendMessage to use FormData
Change from JSON body to FormData:
- Create `new FormData()`
- Append fields: `content`, `type`, `receiverAddress` (or `conversationId`)
- Use raw fetch with FormData (not apiCall which adds JSON headers)
- Don't set Content-Type header (browser auto-sets multipart boundary)

### Technical Changes

**File: `src/lib/api/dehub.ts`**

```typescript
export async function sendMessage(
  conversationId: string,
  content: string,
  type: 'text' | 'image' | 'gif' = 'text',
  mediaUrl?: string
): Promise<DeHubDMMessage> {
  const token = getAuthToken();
  if (!token) throw new Error("Authentication required");
  
  const isNewConversation = conversationId.startsWith('new_');
  const recipientAddress = isNewConversation ? conversationId.replace('new_', '') : undefined;
  
  // Build FormData instead of JSON
  const formData = new FormData();
  formData.append('content', content);
  formData.append('type', type);
  
  if (isNewConversation && recipientAddress) {
    formData.append('receiverAddress', recipientAddress);
  } else {
    formData.append('conversationId', conversationId);
  }
  
  if (mediaUrl) {
    formData.append('mediaUrl', mediaUrl);
  }
  
  // Use raw fetch with FormData (no Content-Type header - browser sets it)
  const response = await fetch(`${DEHUB_API_BASE}/api/dm/upload`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      // Don't set Content-Type - browser sets multipart boundary
    },
    body: formData,
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
  }
  
  const data = await response.json();
  // Handle response normalization...
}
```

This follows the same pattern as `updateProfile()` which successfully uses FormData for the `/api/update_profile` endpoint.
