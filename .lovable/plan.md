

# Fix: Scroll Position Restoration on Back Navigation

## Problem Identified

When you scroll down the home feed, click a post, and use the browser's back button, the feed jumps back to the top instead of restoring your scroll position.

The root cause involves several timing issues:

1. **Early sessionStorage cleanup**: The `POST_OVERLAY_ORIGIN_KEY` is being removed in an `useEffect` when `!isPostRoute`, which runs BEFORE the `useLayoutEffect` that tries to use it
2. **prevPathRef timing**: The restoration logic checks `prevPathRef.current` but this is updated at the end of another effect, causing a race condition
3. **Overlay pattern complication**: Since HomePage stays mounted (just hidden), the restoration logic in AppLayout needs to be more robust

## Solution

Improve the scroll restoration logic in `AppLayout.tsx`:

1. **Use the ref value directly** instead of relying on effect ordering
2. **Delay the cleanup of sessionStorage** until after restoration completes
3. **Add multiple restoration attempts** to handle lazy-loaded content (similar to the scroll restoration hook)

## Implementation

### File: `src/components/app/AppLayout.tsx`

**Changes:**

1. **Refactor the scroll restoration logic**
   - Move restoration logic to run BEFORE cleanup effects
   - Use `savedScrollRef` directly for more reliable restoration
   - Add multiple staggered scroll attempts for lazy-loaded content

2. **Fix the restoration useLayoutEffect**
   ```typescript
   // Restore scroll position when returning to home from post overlay
   useLayoutEffect(() => {
     const isHomePage = location.pathname === '/app';
     const wasInPostOverlay = prevPathRef.current?.startsWith('/app/post/') || 
                              prevPathRef.current?.startsWith('/app/video/');
     
     if (isHomePage && wasInPostOverlay) {
       const savedScroll = sessionStorage.getItem(HOME_SCROLL_POSITION_KEY);
       if (savedScroll) {
         const scrollValue = parseInt(savedScroll, 10);
         
         // Immediate attempt
         window.scrollTo(0, scrollValue);
         
         // Staggered attempts for lazy-loaded content
         const attempts = [0, 50, 100, 200, 400];
         attempts.forEach(delay => {
           setTimeout(() => window.scrollTo(0, scrollValue), delay);
         });
         
         // Clear after restoration attempts complete
         setTimeout(() => {
           sessionStorage.removeItem(HOME_SCROLL_POSITION_KEY);
         }, 500);
       }
     }
   }, [location.pathname]);
   ```

3. **Prevent early cleanup of overlay origin key**
   - Don't clear `POST_OVERLAY_ORIGIN_KEY` immediately when leaving post route
   - Clear it only after scroll restoration is complete

4. **Use the savedScrollRef for backup**
   - If sessionStorage is cleared too early, fall back to the ref value

### Technical Details

| Issue | Fix |
|-------|-----|
| Effect order race condition | Use `useLayoutEffect` with direct ref access |
| SessionStorage cleared too early | Delay cleanup until restoration completes |
| Single scroll attempt fails | Multiple staggered attempts (0-400ms) |
| Lazy-loaded content changes height | MutationObserver or timeout-based retries |

### Expected Result

- Scroll down the home feed to any position
- Click on any post to view it
- Press browser back button
- Feed restores to the exact scroll position you were at

