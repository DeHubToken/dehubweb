import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEHUB_API_BASE = "https://api.dehub.io";

// All combinations to cache
const SORT_MODES = ["holdings", "sentTips", "receivedTips"] as const;
const PERIODS = ["day", "week", "month", "year", "all"] as const;

interface LeaderboardEntry {
  account: string;
  total?: number;
  username?: string;
  userDisplayName?: string;
  avatarUrl?: string;
  sentTips?: number;
  receivedTips?: number;
  staked?: number;
}

interface LeaderboardResponse {
  result?: {
    byWalletBalance?: LeaderboardEntry[];
  };
}

async function fetchLeaderboard(sort: string, period: string): Promise<LeaderboardResponse> {
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

async function fetchUserStaking(account: string): Promise<number> {
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/account_info/${account}`);
    if (!response.ok) return 0;
    
    const data = await response.json();
    const user = data.result || data;
    
    // Check balanceData array first, then direct staked field
    if (user.balanceData?.length > 0) {
      return user.balanceData.reduce((sum: number, b: { staked?: number }) => sum + (b.staked || 0), 0);
    }
    return user.staked || 0;
  } catch (err) {
    console.error(`Failed to fetch staking for ${account}:`, err);
    return 0;
  }
}

async function enrichWithStaking(entries: LeaderboardEntry[]): Promise<LeaderboardEntry[]> {
  const BATCH_SIZE = 10; // Process 10 users at a time
  const enriched: LeaderboardEntry[] = [];
  
  console.log(`Enriching ${entries.length} entries with staking data...`);
  
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        // Skip wallet-only entries (no username) to save API calls
        if (!entry.username) return entry;
        const staked = await fetchUserStaking(entry.account);
        return { ...entry, staked };
      })
    );
    
    // Collect results (both fulfilled and handle rejected gracefully)
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        enriched.push(result.value);
      } else {
        // If failed, keep original entry without staking data
        enriched.push(batch[index]);
      }
    });
    
    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const enrichedCount = enriched.filter(e => e.staked !== undefined).length;
  console.log(`Enrichment complete: ${enrichedCount}/${enriched.length} entries have staking data`);
  
  return enriched;
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
          const rawData = await fetchLeaderboard(sort, period);
          
          // Extract entries from the response
          const entries = rawData?.result?.byWalletBalance || [];
          
          // Enrich with staking data
          const enrichedEntries = await enrichWithStaking(entries);
          
          // Reconstruct the data with enriched entries
          const enrichedData = {
            ...rawData,
            result: { 
              ...rawData.result,
              byWalletBalance: enrichedEntries 
            }
          };
          
          // Upsert into cache table
          const { error } = await supabase
            .from("leaderboard_cache")
            .upsert(
              {
                sort_mode: sort,
                period: period,
                data: enrichedData,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "sort_mode,period" }
            );
          
          if (error) {
            console.error(`Error caching ${sort}/${period}:`, error);
            results.push({ sort, period, success: false, error: error.message });
          } else {
            console.log(`Cached ${sort}/${period} successfully with ${enrichedEntries.length} enriched entries`);
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
        message: `Cached ${successCount}/${totalCount} leaderboard combinations with staking data`,
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
