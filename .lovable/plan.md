

# Fix: Home Feed Infinite Scroll Loading Loop

## The Problem

When scrolling down on the Home tab, the infinite scroll triggers an endless loading loop where multiple pages are fetched simultaneously (page 5, 6, 7, 8... all at once), causing:
- Network request spam
- Duplicate content
- Frozen/janky UI
- Poor user experience

## Root Cause Analysis

The issue is a **React closure stale state problem** with the IntersectionObserver:

1. When the observer callback fires, it reads `isFetchingNextPage` from a **stale closure**
2. Multiple callbacks fire before React re-renders with the updated state
3. Each callback sees `isFetchingNextPage = false` and calls `fetchNextPage()`
4. Result: Multiple pages load simultaneously

### Why Videos Works But Home Doesn't
The Videos feed uses `postType: 'video'` which returns fewer results, so there's less content and the loader element stays off-screen longer. The Home feed has more diverse content, causing the loader to remain visible and fire repeatedly.

---

## Solution

Use a **ref-based guard** to synchronously track fetch state, preventing race conditions. This is the standard React pattern for IntersectionObserver + async state.

---

## Technical Implementation

### File: `src/components/app/feeds/HomeFeed.tsx`

**1. Add a ref to track fetch state:**
```typescript
const isFetchingRef = useRef(false);
```

**2. Update the IntersectionObserver useEffect:**
```typescript
useEffect(() => {
  if (!loaderRef.current || !hasNextPage) return;

  const observer = new IntersectionObserver(
    (entries) => {
      // Use ref for synchronous check - prevents race conditions
      if (entries[0].isIntersecting && hasNextPage && !isFetchingRef.current) {
        isFetchingRef.current = true;
        fetchNextPage().finally(() => {
          isFetchingRef.current = false;
        });
      }
    },
    { threshold: 0.1, rootMargin: '100px' }
  );

  observer.observe(loaderRef.current);
  return () => observer.disconnect();
}, [hasNextPage, fetchNextPage]);
```

**3. Remove `isFetchingNextPage` from the callback closure** since the ref handles it synchronously.

---

### File: `src/components/app/feeds/VideosFeed.tsx`

Apply the same fix for consistency:

```typescript
const isFetchingRef = useRef(false);

useEffect(() => {
  if (!loaderRef.current || !hasNextPage) return;

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !isFetchingRef.current) {
        isFetchingRef.current = true;
        fetchNextPage().finally(() => {
          isFetchingRef.current = false;
        });
      }
    },
    { threshold: 0.1, rootMargin: '100px' }
  );

  observer.observe(loaderRef.current);
  return () => observer.disconnect();
}, [hasNextPage, fetchNextPage]);
```

---

## Why This Works

| Before (Broken) | After (Fixed) |
|-----------------|---------------|
| `isFetchingNextPage` is React state | `isFetchingRef.current` is a mutable ref |
| Updates async after re-render | Updates synchronously on set |
| Multiple callbacks read stale `false` | First callback sets to `true`, others blocked |
| Race condition on rapid scroll | No race condition possible |

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/components/app/feeds/HomeFeed.tsx` | Add `isFetchingRef` ref, update observer to use ref guard |
| `src/components/app/feeds/VideosFeed.tsx` | Same fix for consistency |

This is a one-line ref addition and a minor observer callback update per file.

