
# Fix: Scroll Position Restoration on Back Navigation

## Root Cause Analysis (Final)

After extensive debugging, including live browser testing, the **true root cause** has been identified:

### The Problem: Render Timing Race Condition

When navigating from home to a post:

1. Route changes to `/app/post/123`
2. AppLayout re-renders with new location
3. **CRITICAL**: On this FIRST render:
   - `isPostRoute = true`
   - `cameFromHome = false` (state hasn't updated yet!)
   - `showHomePagePersisted = true && false = false`
4. Since `showHomePagePersisted` is false, the condition `(isHomePage || showHomePagePersisted)` becomes `(false || false) = false`
5. **HomePage UNMOUNTS** - losing all its state and scroll position
6. **THEN** the `useEffect` runs and sets `setCameFromHome(true)`
7. This triggers a re-render, but it's too late - HomePage has already unmounted

The overlay pattern is broken because the state update happens **after** the render, not before.

## Solution

Initialize `cameFromHome` synchronously based on what we can detect during the initial render:

### Approach: Use Lazy State Initialization

React's `useState` accepts an initializer function that runs only once during component mount. We can check sessionStorage AND detect if we're on a post route with a valid "came from home" flag to initialize the state correctly.

Additionally, we need to save the scroll position **before** navigation happens, not after. This requires capturing it during the click event, before React Router processes the navigation.

## Implementation

### File 1: `src/components/app/AppLayout.tsx`

**Change 1: Initialize `cameFromHome` synchronously using lazy state initialization**

Replace line 44:
```typescript
// Before:
const [cameFromHome, setCameFromHome] = useState(false);

// After: Initialize synchronously from sessionStorage
const [cameFromHome, setCameFromHome] = useState(() => {
  // Check sessionStorage on INITIAL RENDER to handle post routes correctly
  const storedOrigin = sessionStorage.getItem(POST_OVERLAY_ORIGIN_KEY);
  return storedOrigin === 'home';
});
```

**Change 2: Save scroll position synchronously BEFORE navigation**

The scroll position must be saved BEFORE React Router processes the navigation, not after. We need to use a global click listener or save on scroll events.

Add a scroll position tracker that saves continuously:

```typescript
// Save home scroll position continuously when on home page
useEffect(() => {
  const isHome = location.pathname === '/app';
  if (!isHome) return;
  
  const saveScroll = () => {
    sessionStorage.setItem(HOME_SCROLL_POSITION_KEY, String(window.scrollY));
  };
  
  // Save immediately
  saveScroll();
  
  // Save on every scroll
  window.addEventListener('scroll', saveScroll, { passive: true });
  
  return () => {
    window.removeEventListener('scroll', saveScroll);
  };
}, [location.pathname]);
```

**Change 3: Set the origin flag when clicking to navigate TO a post**

Modify the effect that detects navigation to set the flag IMMEDIATELY when detecting a post route (for initial render cases):

```typescript
// Detect navigation from home to post
useEffect(() => {
  const currentPath = location.pathname;
  const prevPath = prevPathRef.current;
  
  // Navigating TO a post route FROM home - mark origin
  if (isPostRoute && prevPath === '/app') {
    setCameFromHome(true);
    sessionStorage.setItem(POST_OVERLAY_ORIGIN_KEY, 'home');
    // Scroll is already saved by continuous tracker above
  }
  
  // Update ref AFTER all checks
  prevPathRef.current = currentPath;
}, [location.pathname, isPostRoute]);
```

**Change 4: Simplify the restoration logic**

Keep the existing `useLayoutEffect` for restoration, but remove the redundant sessionStorage check from the first useEffect.

## Technical Summary

| Issue | Current Behavior | Fix |
|-------|-----------------|-----|
| `cameFromHome` initialized to `false` | HomePage unmounts on first render | Initialize from sessionStorage |
| Scroll saved after navigation | Position may be 0 after route change | Save continuously while on home |
| State update in useEffect | Runs after render | Use lazy state initializer |

## Expected Result

1. User scrolls to position 1500 on home feed
2. Scroll is continuously saved to sessionStorage
3. User clicks a post
4. AppLayout re-renders with `cameFromHome = true` (from sessionStorage init)
5. `showHomePagePersisted = true` immediately
6. HomePage stays mounted with `hidden` class
7. User presses back
8. Scroll restored to 1500

## Code Changes Summary

File: `src/components/app/AppLayout.tsx`

1. Change `useState(false)` to `useState(() => sessionStorage.getItem('post-overlay-origin') === 'home')`
2. Add continuous scroll position saving effect when on home page
3. Simplify the navigation detection effect (remove redundant checks)
