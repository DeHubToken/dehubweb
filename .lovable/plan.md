
## Fix PPV/Bounty/Locked Filters to Load All Matching Content

**Root Cause**: When you click PPV (or Bounty/Locked) on the Home feed, the app splits the query into 3 separate API calls -- one for videos, one for images, one for text posts. Each of these returns very few (or zero) PPV items. Meanwhile, a single query without a `postType` restriction would return ALL PPV content at once.

**Fix**: When any content filter is active, force the Home feed to use a single unified API call instead of splitting by content type.

---

### Changes

**File: `src/components/app/feeds/HomeFeed.tsx`** (line 479)

Update the interleaved feed condition to also disable interleaving when content filters are active:

```tsx
// Before
const useInterleavedFeed = selectedPostType === 'all' && !useSingleFeedForGlobalSort;

// After
const hasContentFilter = contentFilters.ppv || contentFilters.w2e || contentFilters.locked;
const useInterleavedFeed = selectedPostType === 'all' && !useSingleFeedForGlobalSort && !hasContentFilter;
```

This single change means that when PPV/Bounty/Locked is toggled, the app fires one API call to `/api/feed?isPPV=true&status=minted` (no `postType` param), which returns every PPV item across all content types.

---

**File: `src/components/app/feeds/VideosFeed.tsx`** and **`src/components/app/feeds/ImagesFeed.tsx`**

Verify these feeds already pass `isPPV`/`hasBounty`/`isLocked` to `useUnifiedFeed` correctly. From the search results, VideosFeed already does (lines 534-536). ImagesFeed needs the same treatment if it uses a different hook -- will wire it up to `useUnifiedFeed` with the filter params when content filters are active (as outlined in the previous approved plan).

---

### Summary

| Feed | Current Behavior | After Fix |
|------|-----------------|-----------|
| Home | 3 separate queries (video/images/text) each with isPPV -- few results | 1 query with isPPV, no postType filter -- all PPV content |
| Videos | Already passes isPPV to useUnifiedFeed -- should work | No change needed |
| Images | Uses useDeHubImages which ignores filters | Switch to useUnifiedFeed when filters active |

This is a minimal change (one line in HomeFeed, one conditional swap in ImagesFeed) that ensures all PPV/Bounty/Locked content loads from the API.
