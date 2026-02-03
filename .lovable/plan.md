

# Fix: Scroll Position Restoration on Back Navigation

## Root Cause Identified

The scroll restoration fails because of a **race condition between two competing systems**:

### System 1: `AppLayout.tsx` (sessionStorage)
- Saves scroll position when navigating FROM home TO a post (correct)
- Attempts to restore when navigating back to home (correct)

### System 2: `useScrollRestoration` hook in `HomePage` (in-memory Map)
- Saves scroll position continuously on EVERY scroll event
- **PROBLEM**: When `SinglePostPage` scrolls to top, this hook captures `window.scrollY = 0` and **overwrites the saved position with 0!**

### Why This Happens
When on the post overlay route:
1. `HomePage` is still mounted (just hidden with CSS `class="hidden"`)
2. The `useScrollRestoration` hook in HomePage is STILL active
3. When `SinglePostPage` runs `window.scrollTo(0, 0)`, the scroll event fires
4. The hook's listener captures this and saves `scrollPositions.set('/app', 0)`
5. This **overwrites** the correct scroll position that was saved earlier

## Solution

**Remove the duplicate scroll restoration system from HomePage** since `AppLayout` already handles this correctly. The hook is not needed because:

1. AppLayout already manages scroll preservation for the overlay pattern
2. Having two systems creates race conditions
3. The in-memory Map can be overwritten by scroll events from the overlay

## Implementation

### File 1: `src/pages/app/HomePage.tsx`

**Change 1: Remove the scroll restoration hook import and usage**

Remove line 19 import:
```typescript
// REMOVE: import { useScrollRestoration } from '@/hooks/use-scroll-restoration';
```

Change line 59 to use a simpler back navigation detection (still needed for tab change logic):
```typescript
// Before:
const { isBackNavigation } = useScrollRestoration('/app');

// After:
import { useNavigationType } from 'react-router-dom';
const navigationType = useNavigationType();
const isBackNavigation = navigationType === 'POP';
```

This removes the duplicate scroll-saving behavior while preserving the `isBackNavigation` check for the tab-change scroll logic.

### File 2: `src/components/app/AppLayout.tsx` (Optional Enhancement)

Add debug logging temporarily to verify the fix works:
```typescript
if (isHomePage && wasInPostOverlay) {
  console.log('[ScrollRestore] Restoring to:', scrollValue);
  // ... existing restoration code
}
```

## Technical Summary

| Issue | Cause | Fix |
|-------|-------|-----|
| Scroll position overwritten | `useScrollRestoration` hook saves `0` when post page scrolls to top | Remove hook, use simple `useNavigationType` instead |
| Two competing systems | AppLayout + hook both try to save/restore | Consolidate to AppLayout only |
| Race condition | Hook's scroll listener fires for all scroll events | Eliminate by removing hook |

## Expected Result

1. User scrolls down home feed to position 2000px
2. User clicks a post → AppLayout saves `2000` to sessionStorage
3. Post page displays (at scroll 0) - no hook overwrites the saved value
4. User presses back → AppLayout restores to `2000`
5. Feed shows at the exact previous position

