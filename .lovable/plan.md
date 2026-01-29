
# Performance Optimization Plan

## Issues Identified

After reviewing the codebase and console logs, I found several performance bottlenecks:

### 1. Duplicate React Keys (High Priority)
Console shows: `Warning: Encountered two children with the same key, "astronomy"`

This causes React to do extra work reconciling duplicates and can lead to visual glitches. The issue is in `VideosFeed.tsx` where videos with the same title or ID are being rendered.

### 2. Multiple IntersectionObservers Per Card (High Priority)
Every `ImageCard` and `VideoCard` creates its own `IntersectionObserver` for view tracking. With 20+ cards on screen, that's 20+ observers running simultaneously, checking visibility every frame.

**Fix**: Use a single shared observer for all feed items.

### 3. Language Detection on Every Card (Medium Priority)
The `useTranslation` hook in `FeedDescription` runs language detection for every visible post. This triggers:
- Regex tests on mount
- Potential API calls to `detect-language` endpoint  
- Caching logic that still runs even when cache hits

**Fix**: Debounce detection and batch requests.

### 4. Unnecessary Framer Motion Animations (Medium Priority)
Many cards use `whileHover={{ scale: 1.1 }}` which triggers layout recalculations. On mobile, these hover animations never fire but the component still sets up listeners.

**Fix**: Conditionally apply motion only on non-touch devices.

### 5. QueryClient Without Optimized Settings (Low Priority)
The QueryClient has no `staleTime` or `gcTime` configured, meaning every refetch is treated as fresh data needing full re-render.

---

## Implementation Changes

### File 1: `src/App.tsx`
Add optimized QueryClient settings:
- `staleTime: 2 * 60 * 1000` (2 minutes) - prevents refetching recently loaded data
- `gcTime: 10 * 60 * 1000` (10 minutes) - keeps cached data longer
- `refetchOnWindowFocus: false` - prevents refetch when switching tabs

### File 2: `src/hooks/use-view-tracking.ts`
Replace individual IntersectionObservers with a shared singleton pattern:
- Create one observer that tracks all feed items
- Use a Map to track element -> tokenId relationships
- Reduces observer count from N to 1

### File 3: `src/components/app/cards/ImageCard.tsx`
Optimize the card:
- Use CSS hover instead of `motion.button` for the AI sparkle icon
- Add `loading="lazy"` to carousel images
- Memoize the translation detection to avoid repeated regex runs

### File 4: `src/hooks/use-dehub-feed.ts` and `src/hooks/use-unified-feed.ts`
Add unique key generation to prevent React duplicate key warnings:
- Append index to tokenId for uniqueness
- Filter out actual duplicates before mapping

### File 5: `src/components/app/TranslatableText.tsx`
Optimize language detection:
- Skip detection if text is very short (under 15 chars)
- Use `useDeferredValue` for translation state to reduce re-renders
- Add early exit for same-language content (e.g., English post for English user)

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| IntersectionObservers | ~50 per page | 1 shared |
| Duplicate key warnings | Yes | None |
| Translation API calls | Per card | Batched/cached |
| Query refetches | Every focus | Smart caching |
| Hover animation setup | All devices | Desktop only |

These changes should make the app feel noticeably snappier, especially when scrolling through the feed.

---

## Technical Details

### Shared IntersectionObserver Pattern

```text
┌─────────────────────────────────────────┐
│       SharedViewObserver (1 instance)   │
├─────────────────────────────────────────┤
│ - Single IntersectionObserver           │
│ - Map<Element, tokenId>                 │
│ - observe(element, tokenId)             │
│ - unobserve(element)                    │
└─────────────────────────────────────────┘
          │ observes
          ▼
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│Card1│ │Card2│ │Card3│ │Card4│  ... N cards
└─────┘ └─────┘ └─────┘ └─────┘
```

### QueryClient Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,     // 2 minutes
      gcTime: 10 * 60 * 1000,       // 10 minutes  
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

This prevents the "wall of spinners" effect when navigating back to the home tab.
