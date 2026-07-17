import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BROKEN_THRESHOLD = 3; // auto-disable after this many reports

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { channel_id } = await req.json();

    if (!channel_id || typeof channel_id !== "string") {
      return new Response(
        JSON.stringify({ error: "channel_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`[report-broken] Reporting channel: ${channel_id}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get current channel
    const { data: channel, error: fetchError } = await supabase
      .from("tv_channels_verified")
      .select("id, broken_reports, is_active, name")
      .eq("id", channel_id)
      .single();

    if (fetchError || !channel) {
      console.log(`[report-broken] Channel not found: ${channel_id}`);
      return new Response(
        JSON.stringify({ error: "Channel not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const newReportCount = (channel.broken_reports || 0) + 1;
    const shouldDeactivate = newReportCount >= BROKEN_THRESHOLD;

    const { error: updateError } = await supabase
      .from("tv_channels_verified")
      .update({
        broken_reports: newReportCount,
        is_active: shouldDeactivate ? false : channel.is_active,
      })
      .eq("id", channel_id);

    if (updateError) {
      console.error("[report-broken] Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update report" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[report-broken] Channel "${channel.name}" now has ${newReportCount} reports. ${shouldDeactivate ? "DEACTIVATED" : "Still active."}`,
    );

    return new Response(
      JSON.stringify({
        channel_id,
        broken_reports: newReportCount,
        deactivated: shouldDeactivate,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[report-broken] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
