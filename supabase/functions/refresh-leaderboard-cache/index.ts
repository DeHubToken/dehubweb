import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEHUB_API_BASE = "https://api.dehub.io";

// All combinations to cache
const SORT_MODES = ["holdings", "sentTips", "receivedTips"] as const;
const PERIODS = ["day", "week", "month", "year", "all"] as const;

async function fetchLeaderboard(sort: string, period: string): Promise<unknown> {
  const params = new URLSearchParams({ sort });
  if (period !== "all") {
    params.set("period", period);
  }
  
  const response = await fetch(`${DEHUB_API_BASE}/api/leaderboard?${params.toString()}`, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch leaderboard: ${response.status}`);
  }
  
  return response.json();
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting leaderboard cache refresh...");
    
    const results: { sort: string; period: string; success: boolean; error?: string }[] = [];
    
    // Fetch and cache all combinations
    for (const sort of SORT_MODES) {
      for (const period of PERIODS) {
        try {
          console.log(`Fetching ${sort}/${period}...`);
          const data = await fetchLeaderboard(sort, period);
          
          // Upsert into cache table
          const { error } = await supabase
            .from("leaderboard_cache")
            .upsert(
              {
                sort_mode: sort,
                period: period,
                data: data,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "sort_mode,period" }
            );
          
          if (error) {
            console.error(`Error caching ${sort}/${period}:`, error);
            results.push({ sort, period, success: false, error: error.message });
          } else {
            console.log(`Cached ${sort}/${period} successfully`);
            results.push({ sort, period, success: true });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          console.error(`Error fetching ${sort}/${period}:`, errorMsg);
          results.push({ sort, period, success: false, error: errorMsg });
        }
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    console.log(`Leaderboard cache refresh complete: ${successCount}/${totalCount} successful`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Cached ${successCount}/${totalCount} leaderboard combinations`,
        results 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );
  } catch (error) {
    console.error("Error refreshing leaderboard cache:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
