

# Real-Time DHB Balance Check on Gated Content Click

## What This Does
Instead of silently blocking you from gated content, the system will keep the gating overlay visible but add an "Unlock" button to the Locked/Gated drawer. When you click it, it fetches your DHB balance in real-time from the blockchain. If you hold enough, the content unlocks instantly with a satisfying reveal -- giving you that dopamine hit of clicking to unlock.

## How It Works

```text
User taps gated overlay
        |
  Drawer opens showing "Must hold X DHB"
        |
  User clicks "Verify & Unlock" button
        |
  Real-time balance check via get-badge-balance edge function
        |
   +----+----+
   |         |
 Enough    Not enough
   |         |
 setLocallyUnlocked(true)   Show "Insufficient balance" message
 Close drawer + reveal       with current balance displayed
```

## Technical Details

### 1. Fix SinglePostPage data passthrough (root cause of your original bug)

**File: `src/pages/app/SinglePostPage.tsx`**
- Add `isOwner: nft.isOwner ?? false` and `isUnlocked: nft.isUnlocked ?? false` to the `toVideoItem()`, `toImagePost()`, and `toTextPost()` transform functions
- This ensures the API's access flags actually reach the card components

### 2. Add "Verify & Unlock" button to the Gated Drawer in VideoCard

**File: `src/components/app/cards/VideoCard.tsx`**
- Import `fetchBadgeBalance` (extract it or call the edge function directly)
- In the Locked Drawer (both thumbnail and immersive versions, ~line 322 and ~line 1552):
  - Add a "Verify & Unlock" glass button below the holdings requirement display
  - On click: fetch balance in real-time via the `get-badge-balance` edge function using the user's wallet address
  - If `balance >= video.lockedPrice`: call `setLocallyUnlocked(true)`, close the drawer, show a success toast
  - If insufficient: display a message showing "Your balance: X DHB" with the shortfall
  - Add a loading spinner state while the balance check is in progress

### 3. Add the same "Verify & Unlock" to ImageCard

**File: `src/components/app/cards/ImageCard.tsx`**
- Same pattern as VideoCard: add the verify button to the Locked Drawer (~line 813)
- On success: `setLocallyUnlocked(true)`, close drawer, toast
- On failure: show balance deficit

### 4. Add the same to the Thumbnail VideoCard variant

**File: `src/components/app/cards/VideoCard.tsx`** (thumbnail variant, ~line 322)
- Same verify button and logic for the compact card's gated drawer

### 5. No new edge functions needed
- The existing `get-badge-balance` edge function already provides real-time on-chain DHB balance
- We just call it directly via `fetch()` when the user clicks "Verify & Unlock"
- No React Query hook needed here since this is a one-shot action, not cached data

### Summary of files changed
- `src/pages/app/SinglePostPage.tsx` -- pass through `isOwner`/`isUnlocked` flags
- `src/components/app/cards/VideoCard.tsx` -- add verify button to both gated drawers
- `src/components/app/cards/ImageCard.tsx` -- add verify button to gated drawer
