

## Problem

When clicking a **$cashtag** in a post (e.g. `$DHB`), the app does a **full browser reload** (`window.location.href = ...`) instead of a client-side React Router navigation. This:

1. Destroys all React state — sidebar panels, query caches, scroll positions
2. Forces a complete re-mount of the entire app (AppLayout, RightSidebar, TabbedSidePanel)
3. Makes the transition feel slow and jarring instead of instant

The sidebar's `WhatsHappening` ticker click correctly uses `navigate()` — the bug is isolated to `TranslatableText.tsx` line 151.

## Fix

**File: `src/components/app/TranslatableText.tsx`** (line ~147-152)

Replace `window.location.href` with React Router's `useNavigate()` for cashtag clicks:

```tsx
// Before (full page reload)
window.location.href = `/app/explore?q=${encodeURIComponent(tag)}`;

// After (client-side navigation)
navigate(`/app/explore?q=${encodeURIComponent(tag)}`);
```

The component already receives or can import `useNavigate`. Need to check if it's a pure render function or a component — if it's not a component, we'll need to pass `navigate` as a prop or restructure slightly.

Also fix the `@mention` click on line 132 which has the same `window.location.href` problem.

