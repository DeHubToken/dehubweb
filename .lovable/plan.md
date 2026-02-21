

# Fix: PPV Video Stays Locked After Purchase

## Problem
After successfully paying for PPV content, the video remains locked because:
1. The `onSuccess` callback in `PPVDrawerContent` only closes the drawer
2. The video's `isUnlocked` flag in the feed data is never updated locally
3. `canBypassGating` remains `false`, so the gating overlay persists

## Solution
Add a local "unlocked" state to `VideoCard` (and `ImageCard`) that gets set to `true` after a successful PPV payment, and factor it into `canBypassGating`.

## Technical Details

### 1. VideoCard.tsx
- Add `const [locallyUnlocked, setLocallyUnlocked] = useState(false);`
- Update bypass: `const canBypassGating = !!(isOwnPost || video.isOwner || video.isUnlocked || locallyUnlocked);`
- Pass `onUnlocked={() => setLocallyUnlocked(true)}` to `PPVDrawerContent` instead of just `onClose`

### 2. ImageCard.tsx
- Same pattern: add `locallyUnlocked` state and wire it into `canBypassGating`

### 3. PPVDrawerContent.tsx
- Add an `onUnlocked` prop (called after successful payment)
- Wire `onSuccess` in `usePPVPayment` to call both `onUnlocked` and `onClose`

### 4. use-ppv-payment.ts (no change needed)
- Already calls `onSuccess` after confirmed transaction -- the fix is purely in how the components respond to that callback

This approach works instantly without needing to refetch the feed, and the unlock persists visually for the session. If the user refreshes, the API's `isUnlocked` flag (set by the backend after the purchase is recorded) will take over.

