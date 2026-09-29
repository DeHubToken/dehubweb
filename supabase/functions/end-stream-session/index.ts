/**
 * End Stream Session
 * ===================
 * Removes stream from live_stream_sessions when user ends stream.
 *
 * POST body: { tokenId: string }
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

  // Only the wallet the token belongs to can end its own session; an
  // x-wallet-address header that disagrees with the token is refused.
  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const walletAddress = auth.wallet;

  try {
    const body = await req.json();
    const { tokenId } = body;

    if (!tokenId || typeof tokenId !== "string") {
      return new Response(
        JSON.stringify({ error: "tokenId is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from("live_stream_sessions")
      .delete()
      .eq("token_id", String(tokenId))
      .eq("address", walletAddress);

    if (error) {
      console.error("[end-stream-session] Delete error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to end stream session" }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[end-stream-session] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
