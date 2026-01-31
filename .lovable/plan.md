
# Fix DM Sending - Add Missing senderAddress

## Problem Identified

The DeHub API `/api/dm/tnx` endpoint requires the `senderAddress` field in the request body, but the current implementation doesn't include it.

**API Error Response:**
```json
{
  "success": false,
  "message": "Missing required fields: senderAddress, receiverAddress, transactionHash, or type."
}
```

**Current Request Body (missing senderAddress):**
```json
{
  "content": "work",
  "type": "text",
  "receiverAddress": "0x9324..."
}
```

## Solution

Add the `senderAddress` field to the request body by reading it from `localStorage.getItem('dehub_wallet')`.

## Technical Changes

**File: `src/lib/api/dehub.ts`** (lines 1566-1591)

Update the `sendMessage` function to:

1. Get the sender's wallet address from localStorage
2. Include `senderAddress` in the request body

```typescript
// Inside sendMessage function, around line 1566
try {
  // Get the sender's wallet address from localStorage
  const senderAddress = localStorage.getItem('dehub_wallet');
  if (!senderAddress) {
    throw new Error("Wallet address not found. Please reconnect your wallet.");
  }
  
  // Build request body for /api/dm/tnx (JSON body)
  const body: Record<string, any> = {
    content,
    type,
    senderAddress,  // ADD THIS - required by API
  };
  
  if (isNewConversation && recipientAddress) {
    body.receiverAddress = recipientAddress;
  } else {
    body.conversationId = conversationId;
  }
  
  if (mediaUrl) {
    body.mediaUrl = mediaUrl;
  }
  
  // Use /api/dm/tnx for sending messages
  const response = await apiCall<any>("/api/dm/tnx", {
    method: "POST",
    body,
    requiresAuth: true,
  });
  // ... rest of function
}
```

## Expected Result

After this fix, the request body will be:
```json
{
  "content": "work",
  "type": "text",
  "senderAddress": "0x742371a7cce6b068f3c6222016bf009d570d7d15",
  "receiverAddress": "0x9324840523a5d17dd12a2f11a9472e5a199c1937"
}
```

This matches the API's required fields and messages will send successfully.
