
# Fix DM Message Sending - Use Correct Endpoint

## Problem
Messages fail to send with error: `"Failed to send file"` and `"Cannot read properties of undefined (reading 'toLowerCase')"`.

The current code sends ALL messages to `/api/dm/upload` which is specifically for **file uploads**. When sending a text message without a file, the backend expects a file field and crashes trying to read its extension.

## Root Cause
- **Current**: All messages go to `/api/dm/upload` (file upload endpoint)
- **Correct**: Text messages should go to `/api/dm/tnx` (transaction endpoint)

The DeHub API has two distinct endpoints:
1. `/api/dm/tnx` (POST) - For sending text/content messages
2. `/api/dm/upload` - For uploading file attachments

## Solution

Update the `sendMessage` function to use the correct endpoint based on message type:

**For text messages**: Use `POST /api/dm/tnx` with JSON body
```javascript
{
  content: "hello",
  type: "text",
  receiverAddress: "0x..." // for new conversations
  // OR
  conversationId: "abc123" // for existing conversations
}
```

**For file/image messages**: Continue using `/api/dm/upload` with FormData (only when there's an actual file to upload)

## Technical Changes

**File: `src/lib/api/dehub.ts`**

Modify the `sendMessage` function (lines 1549-1629):

1. Check if the message has media content (image/gif with actual file)
2. For text messages or messages with just URLs: use `apiCall` to `/api/dm/tnx` with JSON
3. For actual file uploads: use FormData to `/api/dm/upload`

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
  const recipientAddress = isNewConversation 
    ? conversationId.replace('new_', '') 
    : undefined;
  
  // Build request body
  const body: Record<string, any> = {
    content,
    type,
  };
  
  if (isNewConversation && recipientAddress) {
    body.receiverAddress = recipientAddress;
  } else {
    body.conversationId = conversationId;
  }
  
  if (mediaUrl) {
    body.mediaUrl = mediaUrl;
  }
  
  // Use /api/dm/tnx for sending messages (JSON body)
  const response = await apiCall<any>("/api/dm/tnx", {
    method: "POST",
    body,
    requiresAuth: true,
  });
  
  // Handle response normalization...
  return normalizedMessage;
}
```

This matches how `markConversationAsRead` correctly uses `/api/dm/tnx` with PUT, and follows the memory context stating that "Sending messages and marking them as read both utilize the `/api/dm/tnx` endpoint."
