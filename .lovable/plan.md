

## Fix: Restrict Moderation Actions to Moderators Only

### Problem
The pin/unpin and ban/unban actions in the live chat are shown to **every authenticated user**. The `showActions` prop on `ChatMessage` is set to `isAuthenticated` with no moderator check, so any logged-in user sees these options.

### Solution
Use the existing room details (which already include a moderators list) to determine if the current user is a moderator, and only pass `showActions=true` for moderators.

### Changes

**1. `src/components/app/chat/PublicChat.tsx`**
- Derive an `isModerator` flag by checking if the current user's wallet address is in `roomDetails.moderators`
- Pass `showActions={isModerator}` instead of `showActions={isAuthenticated}` to `ChatMessage`
- Also gate the "Unpin" button on the pinned message banner behind the same check

**2. `src/components/app/chat/ChatMessage.tsx`** (no changes needed)
- The component already respects the `showActions` prop correctly -- it just needs to receive the right value from its parent

### Technical Details

In `PublicChat.tsx`, after the existing `roomDetails` hook (around line 61):

```typescript
// Determine if current user is a moderator for this room
const isModerator = useMemo(() => {
  if (!walletAddress || !roomDetails?.moderators) return false;
  return roomDetails.moderators.some(
    (mod: string) => mod.toLowerCase() === walletAddress.toLowerCase()
  );
}, [walletAddress, roomDetails]);
```

Then replace `showActions={isAuthenticated}` with `showActions={isModerator}` on the ChatMessage component (line 308).

Gate the pinned message "Unpin" button (line 247) with `isModerator` instead of `isAuthenticated`.

This also fixes the build errors in `src/lib/wagmi.ts` -- those are a separate pre-existing issue with readonly type assignment that should be addressed by casting `[base] as const` to a mutable type.

