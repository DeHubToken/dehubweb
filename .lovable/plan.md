
## Fix: PPV Info Button Opens Video After Drawer Closes

### Problem
When you tap the PPV info badge (the ticket icon button), it correctly opens the drawer. But when the drawer is dismissed (by tapping the overlay or swiping down), the click event from the overlay bubbles up to the card's root `onClick={handleCardClick}`, which navigates to the video's single post page.

This same issue affects the Bounty and Locked badge drawers too.

### Root Cause
The PPV/Bounty/Locked Drawers are rendered **inside** the card's root `<div>` which has the `handleCardClick` navigation handler. When the drawer overlay is clicked to dismiss, that click propagates up to the card wrapper and triggers navigation.

### Solution
Add a guard in `handleCardClick` that checks whether any drawer (PPV, Bounty, or Locked) is currently open. If any drawer is open, skip navigation entirely.

### Technical Details

**File**: `src/components/app/cards/VideoCard.tsx`

In the `handleCardClick` callback (around line 831), add a check at the top:

```typescript
const handleCardClick = useCallback((e: React.MouseEvent) => {
  // Don't navigate if a drawer is open (PPV/Bounty/Locked)
  if (showPPVDrawer || showBountyDrawer || showLockedDrawer) return;
  
  const target = e.target as HTMLElement;
  const isInteractive = target.closest('button, a, input, ...');
  if (isInteractive) return;
  
  cacheVideoForNavigation(queryClient, video);
  navigate(`/app/post/${video.id}`);
}, [navigate, video.id, queryClient, video, showPPVDrawer, showBountyDrawer, showLockedDrawer]);
```

This ensures that while any drawer is open (or being dismissed), clicking won't navigate away. The same pattern should be checked in the `ImageCard.tsx` component if it has the same issue.
