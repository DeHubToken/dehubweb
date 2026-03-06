

# Fix: Glossary Page 404

## Problem
The `/app/glossary` route is missing from the router in `App.tsx`. The `PersistentPageCache` correctly registers it (line 78), but the React Router config (lines 126-150) has no `<Route path="glossary" element={null} />` entry under the `/app` parent. So navigating to `/app/glossary` falls through to the `*` catch-all and shows a 404 page.

## Fix

**`src/App.tsx`** -- Add one line after the `jobs` route (line 146):

```tsx
<Route path="jobs" element={null} />
<Route path="glossary" element={null} />
```

That's it. The `PersistentPageCache` already handles the actual rendering — we just need the router to recognize the path so it doesn't 404.

