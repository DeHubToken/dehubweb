

# Live Chat Messages Investigation

## Current Status
Your messages **ARE saved** in the database. Both "we shit on farcaster" and "and any other crypto social app I've seen before" are stored correctly with timestamps and your wallet address. The system did not lose them.

## Root Cause: Hybrid Architecture Problem

The live chat currently has a split-brain design:

1. **Room list** comes from the DeHub API (`GET /api/livechat/rooms`) -- this gives us room IDs like `global`, `topic-test`, etc.
2. **Sending messages** goes through our own backend function, which saves to our own database table (`livechat_messages`)
3. **Reading messages** also comes from our own database table
4. **The DeHub API also has its own message storage** (`GET /api/livechat/rooms/{roomId}/messages`) that we never read from or write to

This means:
- Messages sent from the official DeHub app do NOT appear in our chat
- Messages sent from our app do NOT appear in the official DeHub app
- If the room ID returned by the API changes between sessions, messages appear to vanish (they're still in the DB, just filtered by a different room ID)

## The Fix

We should **use the DeHub API as the source of truth** for messages instead of our own database, since the API provides both read (`GET /api/livechat/rooms/{roomId}/messages`) and the messages endpoint. The API docs don't show a POST endpoint for sending, so the edge function approach may still be needed for sending -- but reading should come from the API.

However, since there's no POST endpoint in the API docs you shared, the current sending approach via our backend function is the only option. The fix should focus on:

### Step 1: Read messages from the DeHub API instead of Supabase
- Update `useLiveChatMessages` to fetch from `GET /api/livechat/rooms/{roomId}/messages` (already implemented as `getLiveChatMessages` but never used)
- This ensures messages from all clients (mobile app, web) are visible

### Step 2: Keep Supabase as a write-through + realtime layer
- Continue sending via the `livechat-send` edge function for persistence
- Use Supabase Realtime only for instant delivery of new messages between our web users
- On initial load and periodic refresh, merge API messages with Supabase messages

### Step 3: Deduplicate messages
- Messages may appear in both sources; deduplicate by content + sender + timestamp proximity

## Technical Details

### Files to modify:
- **`src/hooks/use-livechat.ts`** -- Change `useLiveChatMessages` to:
  - Fetch initial messages from the DeHub API (`getLiveChatMessages`) instead of Supabase
  - Keep Supabase Realtime subscription for live updates from our own users
  - Merge and deduplicate both sources
- **`src/lib/api/dehub/livechat.ts`** -- The `getLiveChatMessages` function already exists but needs to map the API response format (which uses `sender.address`, `sender.username`) to our `SupabaseLiveChatMessage` format

### Message format mapping:
```text
API format:                          Our format:
message.sender.address        -->    sender_address
message.sender.username       -->    sender_username  
message.sender.displayName    -->    sender_display_name
message.sender.avatarUrl      -->    sender_avatar_url
message.content               -->    content
message.messageType           -->    message_type
message.createdAt             -->    created_at
```

### Polling strategy:
- Initial load: fetch from API
- Realtime: Supabase channel for instant updates from our users
- Periodic poll (every 15-30s): re-fetch from API to catch messages from other clients (mobile app)

