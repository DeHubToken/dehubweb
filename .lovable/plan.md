

# Fix: GIFs not loading in live chat

## Root Cause

When a GIF message comes from the API (either via socket or REST), it arrives with this shape:
```json
{
  "content": "https://media.giphy.com/media/.../giphy.gif",
  "messageType": "gif",
  "media": [{ "url": "https://...", "type": "image" }]
}
```

The `apiMsgToLocal` function in `use-livechat.ts` (line 110) maps `image_url` from `m.imageUrl` or `m.image_url`, but **never checks `m.media[]`**. So for GIF messages, `image_url` ends up as `null`.

In `PublicChat.tsx`, the mapping only sets `imageUrl` from `msg.image_url`. And in `ChatMessage.tsx`, GIF rendering requires `message.type === 'gif' && message.imageUrl` --- since `imageUrl` is undefined, the GIF doesn't render.

## Fix (two small changes)

### 1. `src/hooks/use-livechat.ts` -- `apiMsgToLocal`
Extract the first `media[].url` as a fallback for `image_url` when `imageUrl`/`image_url` are absent.

### 2. `src/components/app/chat/PublicChat.tsx` -- `toUiMessage`
For GIF messages, if `image_url` is still null, fall back to using `msg.content` as the image URL (since the content IS the GIF URL for gif-type messages).

