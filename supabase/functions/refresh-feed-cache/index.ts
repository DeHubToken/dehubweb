import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300', // CDN cache: 1min fresh, 5min stale OK
};

const DEHUB_API_BASE = "https://api.dehub.io";

// Cache configurations to pre-fetch - trimmed to 3 pages for cost efficiency
// Pages 4+ are fetched live on demand with TanStack Query (10-min staleTime)
const CACHE_CONFIGS: CacheConfig[] = [
  // Latest feed - pages 1-3
  { key: "feed_latest_page1", page: 1, limit: 50, sortBy: "createdAt" },
  { key: "feed_latest_page2", page: 2, limit: 50, sortBy: "createdAt" },
  { key: "feed_latest_page3", page: 3, limit: 50, sortBy: "createdAt" },
  // Popular feed - pages 1-3
  { key: "feed_popular_page1", page: 1, limit: 50, sortBy: "likes" },
  { key: "feed_popular_page2", page: 2, limit: 50, sortBy: "likes" },
  { key: "feed_popular_page3", page: 3, limit: 50, sortBy: "likes" },
  // Per-type latest feeds (HomeFeed uses these 3 types) - page 1 only
  { key: "feed_latest_video_page1", page: 1, limit: 20, sortBy: "createdAt", postType: "video" },
  { key: "feed_latest_feed-images_page1", page: 1, limit: 20, sortBy: "createdAt", postType: "feed-images" },
  { key: "feed_latest_feed-simple_page1", page: 1, limit: 20, sortBy: "createdAt", postType: "feed-simple" },
];

interface CacheConfig {
  key: string;
  page: number;
  limit: number;
  sortBy: string;
  postType?: string;
}

async function fetchFeed(config: CacheConfig): Promise<unknown> {
  const url = new URL("/api/feed", DEHUB_API_BASE);
  url.searchParams.set("page", String(config.page));
  url.searchParams.set("limit", String(config.limit));
  url.searchParams.set("sortBy", config.sortBy);
  url.searchParams.set("sortOrder", "desc");
  url.searchParams.set("status", "minted");
  if (config.postType) url.searchParams.set("postType", config.postType);
  
  console.log(`Fetching feed: ${url.toString()}`);
  
  const response = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`DeHub API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log("Starting feed cache refresh...");
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const results: { key: string; success: boolean; error?: string; itemCount?: number }[] = [];
    
    // Process in batches of 3 to avoid DeHub 429 rate limits
    const BATCH_SIZE = 3;
    for (let i = 0; i < CACHE_CONFIGS.length; i += BATCH_SIZE) {
      const batch = CACHE_CONFIGS.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map(async (config) => {
          console.log(`Processing cache key: ${config.key}`);
          const data = await fetchFeed(config);
          const feedData = data as { result?: unknown[]; pagination?: unknown };
          const itemCount = Array.isArray(feedData.result) ? feedData.result.length : 0;
          console.log(`Fetched ${itemCount} items for ${config.key}`);
          
          const { error: upsertError } = await supabase
            .from("feed_cache")
            .upsert({
              cache_key: config.key,
              data: data,
              updated_at: new Date().toISOString(),
            }, { onConflict: "cache_key" });
          
          if (upsertError) {
            console.error(`Failed to cache ${config.key}:`, upsertError);
            return { key: config.key, success: false, error: upsertError.message };
          }
          console.log(`Successfully cached ${config.key}`);
          return { key: config.key, success: true, itemCount };
        })
      );
      
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({ key: 'unknown', success: false, error: result.reason?.message || 'Unknown error' });
        }
      }
    }
    
    // ========================================================================
    // TRENDING CATEGORIES: Compute from cached feed data
    // ========================================================================
    try {
      console.log("Computing trending categories from cached feed pages...");
      
      // Read only page 1 of latest feed so counts match what users see on click
      const { data: cachedPages } = await supabase
        .from("feed_cache")
        .select("data")
        .eq("cache_key", "feed_latest_page1");
      
      const categoryCounts: Record<string, number> = {};
      
      // Collect all usernames to filter them out of categories
      const allUsernames = new Set<string>();
      if (cachedPages) {
        for (const page of cachedPages) {
          const feedData = page.data as { result?: any[] };
          const items = feedData?.result || [];
          for (const item of items) {
            if (item.minterUsername) allUsernames.add(item.minterUsername.toLowerCase());
            if (item.mintername) allUsernames.add(item.mintername.toLowerCase());
          }
        }
      }
      
      // Categories that are clearly not real categories
      const isValidCategory = (cat: string): boolean => {
        const lower = cat.toLowerCase().trim();
        if (!lower || lower.length < 2) return false;
        if (allUsernames.has(lower)) return false;
        if (lower.includes('_') && /^[a-z0-9_]+$/i.test(lower)) return false;
        if (['others', 'other', 'none', 'n/a', 'general'].includes(lower)) return false;
        return true;
      };
      
      if (cachedPages) {
        for (const page of cachedPages) {
          const feedData = page.data as { result?: any[] };
          const items = feedData?.result || [];
          for (const item of items) {
            
            const cats = Array.isArray(item.category) ? item.category : item.category ? [item.category] : [];
            for (const cat of cats) {
              if (typeof cat === 'string' && isValidCategory(cat)) {
                const trimmed = cat.trim();
                categoryCounts[trimmed] = (categoryCounts[trimmed] || 0) + 1;
              }
            }
          }
        }
      }
      
      // Sort by count descending, take top 10
      const trending = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ id: name, name, slug: name.toLowerCase(), post_count: count }));
      
      console.log(`Found ${trending.length} trending categories:`, trending.map(t => `${t.name}(${t.post_count})`).join(', '));
      
      // Cache trending categories
      await supabase
        .from("feed_cache")
        .upsert({
          cache_key: "trending_categories",
          data: { categories: trending, computed_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }, { onConflict: "cache_key" });
      
      console.log("Trending categories cached successfully");
    } catch (trendingError) {
      console.error("Failed to compute trending categories:", trendingError);
    }
    
    const successCount = results.filter(r => r.success).length;
    const totalItems = results.reduce((sum, r) => sum + (r.itemCount || 0), 0);
    
    console.log(`Feed cache refresh complete: ${successCount}/${CACHE_CONFIGS.length} successful, ${totalItems} total items`);
    
    return new Response(
      JSON.stringify({ 
        success: successCount === CACHE_CONFIGS.length,
        message: `Cached ${successCount}/${CACHE_CONFIGS.length} feed configurations`,
        totalItems,
        results,
        timestamp: new Date().toISOString(),
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
    
  } catch (error) {
    console.error("Feed cache refresh failed:", error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
