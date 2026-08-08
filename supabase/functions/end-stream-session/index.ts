/**
 * End Stream Session
 * ===================
 * Removes stream from live_stream_sessions when user ends stream.
 *
 * POST body: { tokenId: string }
 * Requires: x-dehub-token, x-wallet-address headers
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

/**
 * Check a token really belongs to `address`.
 *
 * This used to probe `GET /account_info/{address}` and accept any 200. That
 * route is a public profile endpoint with no guard — 200 for any token, and
 * for no token at all — so the check passed for everyone and any caller could
 * act as any address they knew. `/auth/verify` is guarded and answers with the
 * address the token actually belongs to, so the claim can be compared against
 * something the caller does not control.
 */
async function validateDeHubToken(token: string, address: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.dehub.io/api/auth/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return typeof data?.address === "string"
      && data.address.toLowerCase() === address.toLowerCase();
  } catch {
    // Fail closed: an unreachable auth service must not authenticate anyone.
    return false;
  }
}

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

  const walletAddress = req.headers.get("x-wallet-address")?.toLowerCase() || "";
  const dehubToken = req.headers.get("x-dehub-token") || "";

  if (!walletAddress || !dehubToken) {
    return new Response(
      JSON.stringify({ error: "x-wallet-address and x-dehub-token headers required" }),
      { status: 401, headers: corsHeaders }
    );
  }

  const isValid = await validateDeHubToken(dehubToken, walletAddress);
  if (!isValid) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired DeHub token" }),
      { status: 401, headers: corsHeaders }
    );
  }

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
