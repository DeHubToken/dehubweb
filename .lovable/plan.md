
# Fix: Scroll Position Restoration on Back Navigation

## Root Cause Analysis

Three issues are causing the scroll to jump to top:

1. **SinglePostPage scrolls to top unconditionally** - The `useEffect` in SinglePostPage (line 188-190) calls `window.scrollTo(0, 0)` whenever the component mounts or the ID changes. This fires even when the component is unmounting during back navigation.

2. **Two competing scroll restoration systems** - The codebase has both:
   - `use-scroll-restoration.ts` (in-memory Map)
   - `AppLayout.tsx` (sessionStorage)
   
   These fight each other and aren't coordinated.

3. **Overlay pattern timing** - When navigating back, `SinglePostPage` briefly remains mounted before `showHomePagePersisted` becomes false, allowing its scroll-to-top effect to fire.

## Solution

Consolidate to a single, robust scroll restoration approach in `AppLayout.tsx` and prevent `SinglePostPage` from interfering during back navigation.

## Implementation

### File 1: `src/pages/app/SinglePostPage.tsx`

**Change:** Only scroll to top when navigating TO a post (not back FROM it)

```typescript
import { useNavigationType } from 'react-router-dom';

// Inside component:
const navigationType = useNavigationType();

// Only scroll to top when PUSHING to a post page, not when POP (back navigation)
useEffect(() => {
  if (navigationType === 'PUSH') {
    window.scrollTo(0, 0);
  }
}, [id, navigationType]);
```

### File 2: `src/components/app/AppLayout.tsx`

**Change 1:** Prevent state from being cleared prematurely

The current logic clears `cameFromHome` and sessionStorage in the same effect that does restoration. This can cause issues if React re-renders. Move cleanup to a separate, delayed effect.

**Change 2:** Add a flag to prevent competing scroll operations

```typescript
// Add a restoration-in-progress flag
const isRestoringScrollRef = useRef(false);

useLayoutEffect(() => {
  const isHomePage = location.pathname === '/app';
  const wasInPostOverlay = sessionStorage.getItem(POST_OVERLAY_ORIGIN_KEY) === 'home';
  
  if (isHomePage && wasInPostOverlay) {
    isRestoringScrollRef.current = true;
    
    const savedScroll = sessionStorage.getItem(HOME_SCROLL_POSITION_KEY);
    const scrollValue = savedScroll ? parseInt(savedScroll, 10) : 0;
    
    if (scrollValue > 0) {
      // Immediate + staggered attempts
      window.scrollTo(0, scrollValue);
      
      const attempts = [16, 50, 100, 200, 400, 800];
      const timeouts = attempts.map(delay => 
        setTimeout(() => window.scrollTo(0, scrollValue), delay)
      );
      
      // Only clean up AFTER all restoration attempts complete
      setTimeout(() => {
        sessionStorage.removeItem(HOME_SCROLL_POSITION_KEY);
        sessionStorage.removeItem(POST_OVERLAY_ORIGIN_KEY);
        setCameFromHome(false);
        isRestoringScrollRef.current = false;
      }, 1000);
      
      return () => timeouts.forEach(clearTimeout);
    }
  }
}, [location.pathname]);
```

### File 3: `src/pages/app/HomePage.tsx`

**Change:** Respect ongoing scroll restoration

The effect at lines 272-301 that resets scroll should also check if restoration is in progress:

```typescript
useEffect(() => {
  // Skip if first mount with back navigation
  if (!hasInitializedRef.current) {
    hasInitializedRef.current = true;
    prevTabRef.current = activeTab;
    if (isBackNavigation) return;
  }
  
  if (prevTabRef.current === activeTab) return;
  prevTabRef.current = activeTab;
  
  // Only reset scroll if we're actually changing tabs (not on back nav)
  window.scrollTo(0, 0);
}, [activeTab, isBackNavigation]);
```

This is already mostly correct, but we need to ensure `isBackNavigation` is properly detected on the first render.

## Technical Summary

| File | Change | Purpose |
|------|--------|---------|
| `SinglePostPage.tsx` | Check `navigationType !== 'POP'` before scrolling | Prevent scroll-to-top on back nav |
| `AppLayout.tsx` | Delay cleanup to 1000ms, add more staggered attempts | Ensure restoration completes before cleanup |
| `HomePage.tsx` | Already has `isBackNavigation` check | Verify it works correctly |

## Expected Result

1. Scroll down the home feed
2. Click on any post
3. Post page opens, scrolls to top (correct)
4. Press browser back button
5. Home feed restores to exact scroll position (fixed!)
