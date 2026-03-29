import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Same RTC token format as `scripts/test-agora-credentials.mjs` (official builder, 006 prefix).
// The previous hand-written "007" token did not match Agora’s wire format → CAN_NOT_GET_GATEWAY_SERVER / invalid vendor key.
import agora from "agora-access-token";

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
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const rtcRole = requestedRole === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

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
