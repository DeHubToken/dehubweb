

# Fix: PPV Content Stays Locked in Feed Due to Caching

## Problem
When you browse the main feed while logged in, PPV content you've already purchased still appears locked. This is because:

1. The feed uses pre-cached data from the server that was fetched **without** your login credentials
2. Since the cache has no knowledge of your purchases, `isUnlocked` is always `false` for every post
3. In Bookmarks/Files, the data is fetched fresh with your credentials, so it works there

## Solution
When you're logged in, skip the server cache and fetch directly from the API with your authentication token. This way the API knows who you are and correctly marks purchased content as unlocked.

Unauthenticated visitors will continue using the fast cached data since they can't have purchases anyway.

## Technical Details

### File: `src/hooks/use-unified-feed.ts`

**Change in `fetchUnifiedFeed` function (line ~456):**

Before:
```typescript
async function fetchUnifiedFeed(params) {
  const cacheKey = getCacheKey(params);
  if (cacheKey) {
    const cached = await fetchCachedFeed(cacheKey);
    if (cached) return cached;
  }
  return fetchUnifiedFeedFromAPI(params);
}
```

After:
```typescript
async function fetchUnifiedFeed(params) {
  // Authenticated users bypass cache to get personalized data (isUnlocked, isLiked, etc.)
  const token = getAuthToken();
  if (!token) {
    const cacheKey = getCacheKey(params);
    if (cacheKey) {
      const cached = await fetchCachedFeed(cacheKey);
      if (cached) return cached;
    }
  }
  return fetchUnifiedFeedFromAPI(params);
}
```

This is a one-line logic change: only use the cache when there's no auth token. Authenticated users always get fresh, personalized data from the API.

