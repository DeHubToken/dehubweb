

# Fix: Feed Randomization Not Working Properly

## The Problem
You're seeing the same creators at the top of the feed every time because the "random" shuffle has multiple flaws:

1. **API returns sorted data first**: When "Random" is selected, the feed fetches with `sortBy: 'createdAt'` and `sortOrder: 'desc'`. This means the API **always returns the newest posts first**. The shuffle then operates on this already-sorted data.

2. **Seeded shuffle is consistent within a session**: The shuffle uses `Date.now()` as a seed on mount, but this only changes when you hard-refresh. Within a session, the same seed produces the same shuffle pattern.

3. **Pagination breaks randomness**: The API returns pages of 20 items sorted by `createdAt`. Page 1 always contains the same 20 newest items, and they get shuffled among themselves. Older content never appears at the top because it's on later pages.

4. **Seed regeneration bug**: On pull-to-refresh, `setRandomSeed(Math.random())` sets a value between 0-1, but `seededRandom()` expects larger integer seeds for good distribution.

---

## Root Cause: Shuffling only works on already-fetched pages

The shuffle happens client-side on **items already loaded from the API**. Since the API returns items in `createdAt desc` order:
- Page 1 = 20 newest posts → these get shuffled among themselves
- Page 2 = next 20 newest → these get shuffled among themselves
- etc.

**Same creators posting frequently will always dominate the top because their posts are on page 1.**

---

## Solution

### Option A: True Random (API-side randomization)
Ask if the DeHub API supports a random sort mode. This would be the cleanest fix.

### Option B: Pre-fetch and shuffle across pages (client-side workaround)
Fetch multiple pages upfront before displaying, then shuffle across all of them.

**Recommended approach:**
1. Fetch first 5 pages (100 items) before rendering
2. Shuffle across ALL 100 items together 
3. Use `Math.random()` instead of seeded random for true randomness each load

---

## Technical Changes

**File: `src/components/app/feeds/HomeFeed.tsx`**

### Changes:
1. **Remove seeded random** - Use `Math.random()` directly for true randomness
2. **Pre-fetch multiple pages** - Before displaying "Random" mode, load 3-5 pages worth of content
3. **Shuffle across all items** - Not just per-page shuffling
4. **New seed on every render** - Don't persist the seed in state

### Code pattern:
```text
// Instead of: shuffling 20 newest items
// Do: fetch 100 items first, then shuffle all 100 together

// balancedShuffle should use Math.random() directly
function balancedShuffle<T>(items: T[]): T[] {
  // Use Math.random() - no seed, true randomness each time
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  // ... interleave text and media posts
}
```

---

## Expected Result
- Fresh random order every page load
- Different creators appear at top, not just the most active/recent
- Older popular content gets mixed in with new content

