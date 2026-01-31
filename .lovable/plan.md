# True Random Feed Implementation

## ✅ COMPLETED

The home feed "Random" sort mode now fetches truly random posts from across the entire database (~2600+ posts) instead of just shuffling the most recent 100 posts.

## Implementation

### New Hook: `src/hooks/use-random-feed.ts`
- Fetches `totalCount` from the API to know the ID range
- Generates random unique post IDs between 1 and totalCount
- Uses `Promise.allSettled` with `getNFTInfo` to fetch posts in parallel
- Filters for minted posts only
- Supports load more with duplicate prevention
- Handles missing/failed IDs gracefully

### Updated: `src/components/app/feeds/HomeFeed.tsx`
- Integrated `useRandomFeed` hook for random mode
- Disabled unified feed pagination when in random mode
- Connected infinite scroll to random feed's `loadMore`
- Single clean loading state (no more 5-page pre-fetch flicker)

## How It Works

1. **On Random Mode Selection:**
   - Unified feed is disabled (`enabled: false`)
   - Random feed hook activates
   - Fetches total post count from API (one lightweight call)
   - Generates 30 random IDs across the full range
   - Fetches those posts in parallel (~30 concurrent requests)
   - Displays truly random content from any time period

2. **On Load More:**
   - Generates new random IDs (excluding already fetched)
   - Appends to existing posts
   - Tracks all fetched IDs to prevent duplicates

3. **On Refresh:**
   - Clears tracked IDs
   - Generates fresh random IDs
   - Completely new random selection

## Benefits
- **True randomness** - Posts from 2019 can appear next to posts from today
- **Better discovery** - High-quality older content resurfaces
- **Single render** - No more 3-4 visual refreshes during load
- **Fresh every time** - Each refresh is genuinely new
