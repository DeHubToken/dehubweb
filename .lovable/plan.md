
# Fix Back Button on Dedicated Post Page

## Problem Identified

The back button on the single post page (`/app/post/:postId`) isn't navigating correctly. This is related to the interaction between:

1. **The Overlay Pattern** - When navigating from the home feed to a post, the app keeps HomePage mounted but hidden, and renders SinglePostPage on top
2. **PageHeader's Back Logic** - Uses `navigate(-1)` with fallback to `/app` based on history checks
3. **Session State Management** - The `cameFromHome` state and session storage keys that track navigation origin

## Root Cause

The PageHeader's `handleBack` function relies on `window.history.length > 1 && location.key !== 'default'` to decide whether to use `navigate(-1)` or fallback to `/app`. However, this check can be unreliable in the overlay pattern context where:

- The history length check may not accurately reflect navigable history
- The `location.key` may not reset properly across navigation states

## Solution

Improve the back navigation logic to be more reliable by:

1. **Use `navigate(-1)` with a fallback timeout** - If navigation doesn't happen within a short window, force navigate to fallback route
2. **OR: Simplify the logic** - Since the overlay pattern already tracks `cameFromHome`, we could leverage that information
3. **Preferred: Add explicit referrer tracking** - Store the previous pathname on navigation and use that for back navigation instead of relying on browser history state

### Technical Details

**Option 1: Add a try-catch and fallback (Simple fix)**
- Use `navigate(-1)` inside a try-catch
- Add a check after navigation to ensure location changed, fallback if not

**Option 2: Track referrer explicitly (More robust)**
- Store the previous route in session storage before navigating to a post
- The back button reads from this storage to know exactly where to go back

**Option 3: Remove history length check (Quickest fix)**
- Since `location.key !== 'default'` is already a good indicator, the history length check might be causing false negatives
- Just rely on `location.key`

### Files to Modify

1. `src/components/app/PageHeader.tsx` - Improve the `handleBack` function logic

### Implementation

Update `handleBack` to use a more reliable approach:

```typescript
const handleBack = () => {
  // location.key will be 'default' only when there's no history
  // This is more reliable than window.history.length which can include entries
  // from before the app was loaded
  if (location.key && location.key !== 'default') {
    navigate(-1);
  } else {
    navigate(fallbackRoute, { replace: true });
  }
};
```

The issue is likely that `window.history.length > 1` is returning `true` even when the navigation came from outside the app (e.g., direct URL access after already having other tabs/history). Removing this check and relying solely on React Router's `location.key` should be more accurate.
