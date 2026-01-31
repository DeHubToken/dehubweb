
# Instant Home Feed Loading - Server-Side Caching Implementation

## Current Problem

Every user visiting the app triggers a direct API call to `https://api.dehub.io/api/feed`, which:
- Takes 1-3+ seconds depending on network conditions
- Puts load on the external DeHub API
- Results in visible loading spinners on every page visit
- No data is shared between users - each person fetches independently

## Solution Overview

Implement **server-side feed caching** using the same proven pattern as the leaderboard, storing pre-fetched feed data in your database that all users share instantly.

```
Current Flow:
User → DeHub API (1-3s) → Display

New Flow:
User → Database Cache (<100ms) → Display (instant!)
Background Job → DeHub API → Updates Cache (every 5 minutes)
```

---

## Architecture

### Caching Strategy

| Cache Key | Description | Refresh Interval |
|-----------|-------------|------------------|
| `feed_latest_page1` | First 50 posts sorted by date | 5 minutes |
| `feed_latest_page2` | Posts 51-100 sorted by date | 5 minutes |
| `feed_popular` | Top 100 most-liked posts | 10 minutes |

### Why This Works
- **Instant loads**: Database query is ~50-100ms vs 1-3s API call
- **Shared cache**: One fetch serves all users
- **Fresh content**: 5-minute refresh means new posts appear within minutes
- **Fallback safety**: If cache is stale/missing, falls back to direct API

---

## Technical Implementation

### 1. Database Table: `feed_cache`

```sql
CREATE TABLE feed_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_feed_cache_key ON feed_cache(cache_key);
CREATE INDEX idx_feed_cache_updated ON feed_cache(updated_at);

-- Enable RLS with public read access (feed is public data)
ALTER TABLE feed_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON feed_cache FOR SELECT USING (true);
```

### 2. Edge Function: `refresh-feed-cache`

Creates a background function that fetches feed data from DeHub API and stores it:

```typescript
// supabase/functions/refresh-feed-cache/index.ts
import { createClient } from "@supabase/supabase-js";

const DEHUB_API_BASE = "https://api.dehub.io";

// Cache configurations to pre-fetch
const CACHE_CONFIGS = [
  { key: "feed_latest_page1", page: 1, limit: 50, sortBy: "createdAt" },
  { key: "feed_latest_page2", page: 2, limit: 50, sortBy: "createdAt" },
  { key: "feed_popular", page: 1, limit: 100, sortBy: "likes" },
];

async function fetchFeed(config) {
  const url = new URL("/api/feed", DEHUB_API_BASE);
  url.searchParams.set("page", config.page);
  url.searchParams.set("limit", config.limit);
  url.searchParams.set("sortBy", config.sortBy);
  url.searchParams.set("sortOrder", "desc");
  url.searchParams.set("status", "minted");
  
  const response = await fetch(url.toString());
  return response.json();
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );
  
  for (const config of CACHE_CONFIGS) {
    const data = await fetchFeed(config);
    await supabase.from("feed_cache").upsert({
      cache_key: config.key,
      data: data,
      updated_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });
  }
  
  return new Response(JSON.stringify({ success: true }));
});
```

### 3. Scheduled Job (pg_cron)

Automatically refresh cache every 5 minutes:

```sql
SELECT cron.schedule(
  'refresh-feed-cache',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/refresh-feed-cache',
    headers := '{"Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'
  )
  $$
);
```

### 4. Frontend Changes

Update `useUnifiedFeed` hook to check cache first:

```typescript
// src/hooks/use-unified-feed.ts

// New function to fetch from cache
async function fetchCachedFeed(cacheKey: string): Promise<UnifiedFeedResponse | null> {
  const { data, error } = await supabase
    .from("feed_cache")
    .select("data, updated_at")
    .eq("cache_key", cacheKey)
    .single();
  
  if (error || !data) return null;
  
  // Check if cache is stale (>10 minutes old)
  const cacheAge = Date.now() - new Date(data.updated_at).getTime();
  if (cacheAge > 10 * 60 * 1000) return null;
  
  return data.data as UnifiedFeedResponse;
}

// Updated fetch function with cache-first strategy
async function fetchUnifiedFeed(params: UnifiedFeedParams): Promise<UnifiedFeedResponse> {
  // Try cache first for common requests
  if (params.page === 1 && params.sortBy === 'createdAt') {
    const cached = await fetchCachedFeed('feed_latest_page1');
    if (cached) return cached;
  }
  
  // Fallback to direct API
  return fetchFromAPI(params);
}
```

---

## User Experience Impact

| Before | After |
|--------|-------|
| 1-3 second loading spinner | Instant content display |
| Each user fetches independently | Shared cache, one fetch for all |
| Network-dependent performance | Consistent fast loads |
| Loading state on every tab switch | Cached data shows immediately |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx_create_feed_cache.sql` | Create | New database table for feed cache |
| `supabase/functions/refresh-feed-cache/index.ts` | Create | Edge function to populate cache |
| `src/hooks/use-unified-feed.ts` | Modify | Add cache-first fetching logic |
| `src/lib/api/feed-cache.ts` | Create | Cache utility functions |

---

## Additional Optimizations (Phase 2)

1. **Optimistic UI**: Show skeleton instantly, then swap in real content
2. **Prefetch on hover**: Load next page when user hovers near bottom
3. **Service Worker**: Cache feed data in browser for offline/instant revisits
4. **Image preloading**: Start loading thumbnails while data is fetching

---

## Summary

This implements the same server-side caching pattern already proven with your leaderboard - storing pre-fetched API data in your database that's refreshed on a schedule. The result is instant feed loading for all users regardless of network speed.
