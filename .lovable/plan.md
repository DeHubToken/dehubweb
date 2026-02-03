

# Fix: Scroll Position Restoration on Back Navigation

## Root Cause Analysis

After deep investigation, there are **two critical issues**:

### Issue 1: Browser Default Scroll Restoration Not Disabled

The `useScrollRestoration` hook contains code that sets `history.scrollRestoration = 'manual'` (line 41 of the hook file). However, since we removed the hook from `HomePage` and it's not used anywhere else, **this critical line never executes**.

The browser defaults to `'auto'` scroll restoration, which fights with our custom restoration logic and typically resets to position 0 for SPA route changes.

### Issue 2: AppLayout's Restoration Runs Too Early

The `useLayoutEffect` in AppLayout attempts to restore scroll immediately, but the HomePage content might not be fully rendered yet (especially with the `hidden` → visible transition and lazy-loaded content).

## Solution

### Step 1: Disable Browser Default Scroll Restoration in AppLayout

Move the `history.scrollRestoration = 'manual'` line to AppLayout so it runs once globally.

### Step 2: Add More Robust Restoration with RAF + MutationObserver

Use `requestAnimationFrame` and `MutationObserver` to ensure scroll restoration happens after content is actually rendered in the DOM.

## Implementation

### File 1: `src/components/app/AppLayout.tsx`

**Change 1: Disable browser's automatic scroll restoration (add at the top of the component)**

```typescript
// Disable browser's automatic scroll restoration globally
// This is CRITICAL - browsers default to 'auto' which fights our custom logic
useEffect(() => {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
}, []);
```

**Change 2: Improve the scroll restoration logic with RAF and MutationObserver**

Replace the current `useLayoutEffect` with a more robust version:

```typescript
// Restore scroll position when returning to home from post overlay
useLayoutEffect(() => {
  const isHomePage = location.pathname === '/app';
  const wasInPostOverlay = sessionStorage.getItem(POST_OVERLAY_ORIGIN_KEY) === 'home';
  
  if (isHomePage && wasInPostOverlay) {
    const savedScroll = sessionStorage.getItem(HOME_SCROLL_POSITION_KEY);
    const scrollValue = savedScroll ? parseInt(savedScroll, 10) : 0;
    
    if (scrollValue > 0) {
      // Attempt scroll restoration function
      const attemptScroll = () => {
        window.scrollTo(0, scrollValue);
      };
      
      // Immediate attempt
      attemptScroll();
      
      // Use requestAnimationFrame for after-paint timing
      requestAnimationFrame(() => {
        attemptScroll();
        requestAnimationFrame(attemptScroll);
      });
      
      // Extended staggered attempts for lazy-loaded content
      const attempts = [16, 50, 100, 200, 400, 800];
      const timeouts = attempts.map(delay => 
        setTimeout(attemptScroll, delay)
      );
      
      // MutationObserver to catch content loading
      const observer = new MutationObserver(attemptScroll);
      observer.observe(document.body, { childList: true, subtree: true });
      
      // Cleanup after restoration window
      const cleanupTimeout = setTimeout(() => {
        observer.disconnect();
        sessionStorage.removeItem(HOME_SCROLL_POSITION_KEY);
        sessionStorage.removeItem(POST_OVERLAY_ORIGIN_KEY);
        setCameFromHome(false);
      }, 1000);
      
      return () => {
        timeouts.forEach(clearTimeout);
        clearTimeout(cleanupTimeout);
        observer.disconnect();
      };
    }
  }
}, [location.pathname]);
```

## Technical Summary

| Issue | Current State | Fix |
|-------|---------------|-----|
| Browser scroll restoration | Default `'auto'` (fights custom logic) | Set `history.scrollRestoration = 'manual'` in AppLayout |
| Restoration timing | `useLayoutEffect` runs before content renders | Add `requestAnimationFrame` + `MutationObserver` |
| Content visibility | Feed transitions from `hidden` to visible | RAF ensures we wait for actual paint |

## Expected Result

After these changes:
1. Browser's automatic scroll behavior is disabled
2. Custom restoration waits for content to render
3. MutationObserver catches lazy-loaded content
4. Scroll position restores accurately on back navigation


