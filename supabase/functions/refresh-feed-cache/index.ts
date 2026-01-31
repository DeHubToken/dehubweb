import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEHUB_API_BASE = "https://api.dehub.io";

// Cache configurations to pre-fetch
const CACHE_CONFIGS = [
  { key: "feed_latest_page1", page: 1, limit: 50, sortBy: "createdAt" },
  { key: "feed_latest_page2", page: 2, limit: 50, sortBy: "createdAt" },
  { key: "feed_popular", page: 1, limit: 100, sortBy: "likes" },
];

interface CacheConfig {
  key: string;
  page: number;
  limit: number;
  sortBy: string;
}

async function fetchFeed(config: CacheConfig): Promise<unknown> {
  const url = new URL("/api/feed", DEHUB_API_BASE);
  url.searchParams.set("page", String(config.page));
  url.searchParams.set("limit", String(config.limit));
  url.searchParams.set("sortBy", config.sortBy);
  url.searchParams.set("sortOrder", "desc");
  url.searchParams.set("status", "minted");
  
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
    
    // Fetch and cache each configuration
    for (const config of CACHE_CONFIGS) {
      try {
        console.log(`Processing cache key: ${config.key}`);
        
        const data = await fetchFeed(config);
        
        // Validate response has expected structure
        const feedData = data as { result?: unknown[]; pagination?: unknown };
        const itemCount = Array.isArray(feedData.result) ? feedData.result.length : 0;
        
        console.log(`Fetched ${itemCount} items for ${config.key}`);
        
        // Upsert into cache table
        const { error: upsertError } = await supabase
          .from("feed_cache")
          .upsert({
            cache_key: config.key,
            data: data,
            updated_at: new Date().toISOString(),
          }, { 
            onConflict: "cache_key" 
          });
        
        if (upsertError) {
          console.error(`Failed to cache ${config.key}:`, upsertError);
          results.push({ key: config.key, success: false, error: upsertError.message });
        } else {
          console.log(`Successfully cached ${config.key}`);
          results.push({ key: config.key, success: true, itemCount });
        }
      } catch (fetchError) {
        console.error(`Error fetching ${config.key}:`, fetchError);
        results.push({ 
          key: config.key, 
          success: false, 
          error: fetchError instanceof Error ? fetchError.message : "Unknown error" 
        });
      }
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
