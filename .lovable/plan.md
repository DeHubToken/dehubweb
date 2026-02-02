
# Plan: Fix Long Loading Time When Clicking Home Logo

## Root Cause Analysis

When clicking the home button/logo, the app dispatches a `home-refresh` event which triggers a **full feed reset**:

```
Logo Click
  → dispatches 'home-refresh' event
  → triggerRefresh() called
  → refreshKey increments
  → HomeFeed receives new shuffleKey
  → Resets hasPreFetched to false
  → Clears sessionStorage cache marker
  → Refetches data
  → For "Random" mode: pre-fetches 5 pages sequentially!
```

This causes a long loading spinner because:
1. The feed completely resets its state
2. Random mode requires pre-fetching 5 pages before showing content
3. Each page fetch is sequential, not parallel

## Solution: Smart Refresh Logic

Only trigger a full refresh when it makes sense:

1. **If navigating TO home from another page**: Just navigate, don't refresh
2. **If already on home and clicking logo**: Scroll to top, optionally refresh only if explicitly requested (e.g., long-press or pull-to-refresh)

The current behavior always refreshes, even when just navigating to home. This is unnecessary and slow.

## Implementation

### 1. Update Logo Click Handlers

**Files:** 
- `src/components/app/navigation/MobileHeader.tsx`
- `src/components/app/navigation/DesktopSidebar.tsx`

Change the logo click behavior:
- If NOT on `/app` → Just navigate to `/app` (no refresh)
- If already on `/app` → Scroll to top only (no refresh), or dispatch refresh only on double-tap

```tsx
const handleLogoClick = (e: React.MouseEvent) => {
  e.preventDefault();
  
  if (location.pathname === '/app') {
    // Already on home - just scroll to top, don't trigger full refresh
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (location.pathname.startsWith('/app')) {
    // Coming from another app page - navigate without refresh
    navigate('/app');
  } else {
    // Coming from outside app - navigate normally
    navigate('/app');
  }
};
```

### 2. Remove Automatic Refresh on Navigation

The `home-refresh` event should only be dispatched when explicitly requested (pull-to-refresh, double-tap on home tab, etc.), NOT on regular navigation.

### 3. Preserve Feed State

When navigating back to home, the overlay pattern already preserves state. For other navigations, React Query's cache ensures fast loading. The pre-fetch state (`hasPreFetched`) should NOT be reset just from navigation.

## Expected Result

| Action | Before | After |
|--------|--------|-------|
| Click logo while on home | Full refresh, 5-page pre-fetch, long spinner | Scrolls to top instantly |
| Click logo from /app/post/:id | Full refresh, 5-page pre-fetch, long spinner | Shows cached feed instantly |
| Click logo from /app/settings | Full refresh, 5-page pre-fetch, long spinner | Shows cached feed instantly |
| Pull-to-refresh on home | Full refresh | Full refresh (unchanged) |
| Double-tap home tab | Toggles filters | Could trigger refresh (optional) |

## Files to Modify

1. **`src/components/app/navigation/MobileHeader.tsx`** - Update logo click handler
2. **`src/components/app/navigation/DesktopSidebar.tsx`** - Update logo click handler

## Technical Notes

- React Query cache (`staleTime`) handles data freshness
- The overlay pattern preserves state when navigating from posts
- Pull-to-refresh remains the explicit way to force a refresh
- The existing `home-refresh` event listener in HomePage can stay for pull-to-refresh, but won't be triggered by logo clicks
