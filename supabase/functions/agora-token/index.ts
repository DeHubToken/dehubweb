import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Same RTC token format as `scripts/test-agora-credentials.mjs` (official builder, 006 prefix).
// The previous hand-written "007" token did not match Agora’s wire format → CAN_NOT_GET_GATEWAY_SERVER / invalid vendor key.
import agora from "agora-access-token";
import { requireDeHubAuth } from "../_shared/auth.ts";

const { RtcTokenBuilder, RtcRole } = agora as {
  RtcTokenBuilder: {
    buildTokenWithUid: (
      appId: string,
      certificate: string,
      channel: string,
      uid: number,
      role: number,
      privilegeExpiredTs: number,
    ) => string;
  };
  RtcRole: { PUBLISHER: number; SUBSCRIBER: number };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Who is allowed to be handed a PUBLISHER token.
 *
 * This function is verify_jwt = false and takes only a channel name, which is
 * what makes guest listening free: a signed-out visitor on an invite link can
 * mint a subscriber token with the publishable key and nothing else. That part
 * is deliberate and stays.
 *
 * The same openness applied to `role: "publisher"`, which is not deliberate.
 * `audio_spaces` is world-readable, so `channel_name` is public, and anyone who
 * read one could mint a broadcaster token and talk in that room. They would
 * hold no participant row, so nobody could see them in the UI and the host's
 * "remove speaker" — which updates a row that does not exist — could not evict
 * them.
 *
 * A publisher token now requires a verified DeHub token whose wallet is either
 * the stage's host or holds an active host/speaker participant row. Every
 * legitimate path already writes that row BEFORE asking for a token (both
 * clients: create, start-scheduled and join all insert or upsert first), so
 * this costs nothing at the call sites.
 *
 * ── Rollout ──
 * Refusing outright would break every already-installed client that does not
 * yet send the header — every mobile build in the wild, and every browser tab
 * holding an older chunk. So the gate ships in report-only mode: it evaluates,
 * logs what it WOULD refuse, and issues the token anyway. Set
 * AGORA_PUBLISHER_GATE=enforce once the logs are quiet to turn it on, with no
 * redeploy needed to go back.
 */
function gateMode(): "enforce" | "report" {
  return Deno.env.get("AGORA_PUBLISHER_GATE") === "enforce" ? "enforce" : "report";
}

/**
 * Is this wallet entitled to publish into this channel?
 *
 * Deliberately does NOT gate on the stage being `live`. A host is entitled to
 * their own room whatever state the row is in, and a channel whose stage is not
 * live has nobody in it to talk to — so the status check would only add a race
 * against the client's own "flip to live, then fetch a token" ordering.
 */
async function mayPublish(channelName: string, wallet: string): Promise<boolean> {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: stage } = await admin
    .from("audio_spaces")
    .select("id, host_wallet_address")
    .eq("channel_name", channelName)
    .maybeSingle();
  if (!stage) return false;

  if ((stage.host_wallet_address || "").toLowerCase() === wallet) return true;

  const { data: seat } = await admin
    .from("space_participants")
    .select("role")
    .eq("space_id", stage.id)
    .eq("wallet_address", wallet)
    .is("left_at", null)
    .maybeSingle();

  return seat?.role === "host" || seat?.role === "speaker";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const AGORA_APP_ID = Deno.env.get("AGORA_APP_ID");
    const AGORA_APP_CERTIFICATE = Deno.env.get("AGORA_APP_CERTIFICATE");

    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      console.error("Missing Agora credentials");
      return new Response(JSON.stringify({ error: "Agora credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { channelName, uid, role: requestedRole } = await req.json();

    if (!channelName) {
      return new Response(JSON.stringify({ error: "channelName is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userUid = uid ?? 0;
    const wantsPublisher = requestedRole === "publisher";
    const rtcRole = wantsPublisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    // Subscriber tokens stay open — that is the whole guest-listening path.
    if (wantsPublisher) {
      const mode = gateMode();
      const auth = await requireDeHubAuth(req);
      let refusal: string | null = null;

      if (!auth.ok) {
        refusal = "no valid DeHub token";
      } else if (!(await mayPublish(channelName, auth.wallet))) {
        refusal = `wallet ${auth.wallet} holds no host/speaker seat`;
      }

      if (refusal) {
        if (mode === "enforce") {
          console.warn(`[agora-token] refused publisher for ${channelName}: ${refusal}`);
          return new Response(
            JSON.stringify({ error: "Not entitled to speak in this stage." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        // Report-only: this is what enforcing would have blocked. Quiet logs
        // here are the signal that AGORA_PUBLISHER_GATE=enforce is safe.
        console.warn(
          `[agora-token] would refuse publisher for ${channelName}: ${refusal} (gate=report)`,
        );
      }
    }

    const expirationTimeInSeconds = 86400;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    console.log(
      `Generating token for channel: ${channelName}, uid: ${userUid}, role: ${requestedRole}`,
    );

    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID.trim(),
      AGORA_APP_CERTIFICATE.trim(),
      channelName,
      userUid,
      rtcRole,
      privilegeExpiredTs,
    );

    console.log(`Token generated successfully for channel: ${channelName}`);

    return new Response(
      JSON.stringify({
        token,
        appId: AGORA_APP_ID.trim(),
        channel: channelName,
        uid: userUid,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error generating Agora token:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
