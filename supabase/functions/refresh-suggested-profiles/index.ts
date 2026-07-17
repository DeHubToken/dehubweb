import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEHUB_API = "https://api.dehub.io";
const CACHE_SIZE = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch leaderboard from DeHub API - get top users by holdings (most active/engaged)
    const leaderboardRes = await fetch(`${DEHUB_API}/api/leaderboard?sort=holdings`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!leaderboardRes.ok) {
      throw new Error(`Leaderboard API returned ${leaderboardRes.status}`);
    }

    const leaderboardData = await leaderboardRes.json();
    
    // Extract entries from various response shapes
    let entries: any[] = [];
    if (Array.isArray(leaderboardData?.result?.byWalletBalance)) {
      entries = leaderboardData.result.byWalletBalance;
    } else if (Array.isArray(leaderboardData?.result)) {
      entries = leaderboardData.result;
    } else if (Array.isArray(leaderboardData)) {
      entries = leaderboardData;
    }

    if (entries.length === 0) {
      return new Response(
        JSON.stringify({ error: "No leaderboard entries found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sort by a composite activity score: followers + likes + uploads weighted
    // Filter out entries without usernames
    const scored = entries
      .filter((e: any) => e.username || e.account)
      .map((e: any) => ({
        address: (e.account || "").toLowerCase(),
        username: e.username || null,
        display_name: e.userDisplayName || e.username || null,
        avatar_url: e.avatarUrl || null,
        followers: e.followers || 0,
        likes: e.likes || 0,
        badge_balance: e.badgeBalance || e.total || 0,
      }))
      .filter((e: any) => e.address)
      .slice(0, CACHE_SIZE);

    if (scored.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid profiles to cache" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clear old cache and insert new
    await supabase.from("suggested_profiles_cache").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const { error: insertError } = await supabase
      .from("suggested_profiles_cache")
      .insert(
        scored.map((p: any) => ({
          address: p.address,
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          followers: p.followers,
          likes: p.likes,
          badge_balance: p.badge_balance,
          updated_at: new Date().toISOString(),
        }))
      );

    if (insertError) {
      throw new Error(`Insert failed: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, cached: scored.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[refresh-suggested-profiles] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
