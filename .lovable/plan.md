

## Fix Public Chat Title and Subtitle

The current room header displays "test" and "Discussion about test" because these values come from the live chat room data returned by the DeHub API. Someone created the room with topic "test" -- this was not intentional branding.

### Changes

**File: `src/components/app/chat/PublicChat.tsx`**

Update line 162-163 to hardcode the Public Chat branding instead of relying on API data:

```typescript
// Before
const roomName = enrichedRoom?.name || enrichedRoom?.topic || 'Public Chat';
const roomDescription = enrichedRoom?.description;

// After
const roomName = 'Public Chat';
const roomDescription = 'All things DeHub';
```

This ensures the Public Chat header always shows "Public Chat" with subtitle "All things DeHub", regardless of what the backend room data contains.

### Technical Note
This is a 2-line change in `src/components/app/chat/PublicChat.tsx` (lines 162-163). The room selector dropdown (for multiple rooms) will still show API-provided names, but the main Public Chat room will always display the correct branding.
