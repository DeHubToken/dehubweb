/**
 * Mark Stream Live
 * =================
 * When api.dehub.io /api/live/start fails, we store the stream as "live"
 * in Supabase so the UI shows it correctly.
 *
 * POST body: { tokenId: string, streamId?: string, address: string }
 * Requires: x-dehub-token header (x-wallet-address, if sent, must match it)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireDeHubAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: corsHeaders }
    );
  }

  // The session is written under the wallet the token belongs to; an
  // x-wallet-address header that disagrees with the token is refused.
  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const walletAddress = auth.wallet;

  try {
    const body = await req.json();
    const { tokenId, streamId } = body;

    if (!tokenId || typeof tokenId !== "string") {
      return new Response(
        JSON.stringify({ error: "tokenId is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Called once to go live and then once a minute while on air, so this is
    // both the marker and the pulse. `started_at` is only moved on the first
    // write — a heartbeat that reset it would make every stream look like it
    // just began.
    const existing = await supabase
      .from("live_stream_sessions")
      .select("started_at")
      .eq("token_id", String(tokenId))
      .maybeSingle();

    const { error } = await supabase.from("live_stream_sessions").upsert(
      {
        token_id: String(tokenId),
        stream_id: streamId || null,
        address: walletAddress,
        started_at: existing.data?.started_at ?? now,
        heartbeat_at: now,
      },
      { onConflict: "token_id" }
    );

    if (error) {
      console.error("[mark-stream-live] Upsert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to mark stream live" }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: true, tokenId }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[mark-stream-live] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
