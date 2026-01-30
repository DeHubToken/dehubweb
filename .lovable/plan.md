
# Clear Pinned Post URL Parameter on Page Load

## Current Behavior
When you visit `/app/post/2530`, it redirects to `/app?post=2530` and shows the pinned post at the top. The `?post=2530` stays in the URL, so when you refresh, the pinned post reappears.

## Desired Behavior
After the pinned post is shown once, clear the URL parameter so a refresh shows the normal feed without the pinned post.

## Solution
Add a `useEffect` in `HomePage.tsx` that clears the `?post=` parameter from the URL after the component mounts. This creates a "one-time view" experience where:
1. User clicks a post link
2. Post appears pinned at top
3. URL is silently cleared (no page reload)
4. Refreshing shows the normal feed

## Technical Details

### Changes to `src/pages/app/HomePage.tsx`

Add a `useEffect` that runs once after mount to clear the post parameter from the URL without triggering a navigation:

```tsx
const [searchParams, setSearchParams] = useSearchParams();

// Extract pinned post ID from URL params (one-time view)
const pinnedPostId = searchParams.get('post') || undefined;

// Clear the post param from URL after initial render (so refresh shows normal feed)
useEffect(() => {
  if (pinnedPostId) {
    // Use replace to avoid adding to browser history
    setSearchParams({}, { replace: true });
  }
}, []); // Empty deps = run once on mount
```

This uses React Router's `setSearchParams` with `replace: true` to silently update the URL without:
- Causing a page reload
- Adding a new history entry
- Losing the `pinnedPostId` value (since we captured it before clearing)

## Result
- First visit to `/app?post=2530`: Pinned post shows, URL immediately becomes `/app`
- Refresh: Normal feed without pinned post
- Back button still works correctly (navigates to previous page, not the cleared URL)
