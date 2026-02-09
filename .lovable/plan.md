

# Fix: DMs Failing to Send

## Problem
The `sendMessage` function in `src/lib/api/dehub.ts` sends all messages (including plain text) to `/api/dm/upload` using `FormData`. This endpoint is designed for file/media uploads. Regular text messages should be sent via the `/api/dm/tnx` endpoint using JSON, which is the standard DM transaction endpoint (already used for marking messages as read and referenced in conversation creation).

## Solution
Refactor `sendMessage` to use the correct endpoint based on message type:

1. **Text messages** -- Send via `POST /api/dm/tnx` with JSON body containing `conversationId` (or `receiver` for new conversations), `content`, and `sender`
2. **Media messages** (image, gif, audio, video) -- Continue using `POST /api/dm/upload` with FormData since that endpoint handles file attachments

## Technical Details

### File: `src/lib/api/dehub.ts` (sendMessage function, ~lines 2364-2462)

Changes:
- Split the logic into two paths based on whether the message has media
- For text-only messages: use `apiCall` helper with JSON body to `POST /api/dm/tnx`
  - Body: `{ sender, conversationId, content, type }` (or `receiver` instead of `conversationId` for new conversations)
- For media messages: keep the existing FormData + `/api/dm/upload` flow
- Both paths share the same response normalization logic

### No other files need changes
The hook (`useSendMessage` in `use-messages.ts`) and the component (`DirectMessageChat.tsx`) call `sendMessage` with the same signature, so the fix is isolated to the API layer.
