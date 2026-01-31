
# Fix DM Message Sending - Use Correct Endpoint

## Problem Identified

The `/api/dm/tnx` endpoint is failing because it requires a `transactionHash` field. This endpoint appears to be specifically for recording **blockchain transactions** (like tips), not for sending regular text messages.

**Current Error:**
```json
{
  "success": false,
  "message": "Missing required fields: senderAddress, receiverAddress, transactionHash, or type."
}
```

Despite having `senderAddress`, `receiverAddress`, and `type` in the request, the API still fails because `transactionHash` is required for this endpoint.

## Root Cause Analysis

The endpoint naming reveals the issue:
- `/api/dm/tnx` = "transaction" endpoint - for recording blockchain transactions
- `/api/dm/upload` = file/message upload endpoint

The memory context stating "Sending messages and marking them as read both utilize the `/api/dm/tnx` endpoint" appears to be incorrect or outdated.

## Solution

Switch back to using the `/api/dm/upload` endpoint with FormData for sending messages. This endpoint handles both text and media messages:

**For text messages**: Use FormData with message fields (no file attachment)
**For media messages**: Use FormData with both message fields and file attachment

The `/api/dm/upload` endpoint accepts:
- `content` - Message text
- `type` - Message type ("text", "image", "gif")
- `senderAddress` - Sender's wallet address
- `receiverAddress` - Recipient's wallet address (for new conversations)
- `conversationId` - Existing conversation ID
- `file` - Optional file attachment

## Technical Changes

**File: `src/lib/api/dehub.ts`** (sendMessage function, lines ~1550-1630)

Revert to using FormData and `/api/dm/upload` endpoint:

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
  
  const senderAddress = localStorage.getItem('dehub_wallet');
  if (!senderAddress) {
    throw new Error("Wallet address not found");
  }
  
  // Build FormData for /api/dm/upload endpoint
  const formData = new FormData();
  formData.append('content', content);
  formData.append('type', type);
  formData.append('senderAddress', senderAddress);
  
  if (isNewConversation && recipientAddress) {
    formData.append('receiverAddress', recipientAddress);
  } else {
    formData.append('conversationId', conversationId);
  }
  
  if (mediaUrl) {
    formData.append('mediaUrl', mediaUrl);
  }
  
  // Use /api/dm/upload for sending messages
  const response = await fetch(`${DEHUB_API_BASE}/api/dm/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      // Don't set Content-Type - browser sets it with boundary
    },
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to send message');
  }
  
  return await response.json();
}
```

## Key Differences From Previous Attempts

1. **Use `/api/dm/upload` instead of `/api/dm/tnx`** - The upload endpoint is designed for messages
2. **Use FormData instead of JSON** - The upload endpoint expects multipart/form-data
3. **Include `senderAddress`** - Required field we discovered earlier
4. **Keep existing field names** - `content`, `type`, `receiverAddress`, `conversationId`

## Expected Result

Messages will be sent via the upload endpoint which handles both text and media, without requiring a blockchain transaction hash.
