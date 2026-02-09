

# Fix: Story Views Still Flashing "0"

## Root Cause

The previous fix correctly changed the *return type* to `number | null`, but there are two remaining issues that still cause `0` to appear:

1. **`queryFn` returns `0` as a fallback** (line 31 and line 40) -- once the query resolves with `0`, `fetchedCount` becomes `0`. Since `0` is not nullish, the `??` chain (`fetchedCount ?? cache ?? null`) stops at `0` and never reaches `null`.

2. **Error fallback returns `0`** (line 36: `viewCountCache.get(storyId) ?? 0`) -- if the fetch fails and there's no cache, it returns `0` instead of letting the value stay unknown.

In short: the query eagerly resolves to `0`, and `??` treats `0` as a valid value, so the UI sees "0 views" before the real count arrives.

## Fix

### File: `src/hooks/use-story-views.ts`

1. Change `queryFn` to return `null` instead of `0` for all fallback paths (no storyId, fetch error with no cache, API returns no count). Change the return type to `Promise<number | null>`.

2. Update the `viewCount` derivation to treat `fetchedCount === 0` differently from `fetchedCount === null`:
   - Use an explicit check: if `fetchedCount` is a number (including 0), use it. If it's `null`/`undefined`, fall back to cache, then `null`.

```
const viewCount: number | null = storyId
  ? (fetchedCount !== undefined && fetchedCount !== null
      ? fetchedCount
      : viewCountCache.get(storyId) ?? null)
  : null;
```

3. Only cache when the count is a real number (not null):
   - In `queryFn`, only call `viewCountCache.set()` when count is a real number from the API.

This ensures `viewCount` stays `null` until the API actually responds with a number, and the UI hides the view count element entirely during that window.

