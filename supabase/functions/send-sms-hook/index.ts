// Send SMS Hook — delivers Supabase's auth OTP through CloudTalk.
//
// CloudTalk is not one of the SMS providers Supabase can call directly (that
// list is Twilio, Twilio Verify, MessageBird, Vonage and Textlocal), so phone
// login goes through this hook instead: Supabase generates and later verifies
// the code, and all this function does is carry it to CloudTalk. Nothing here
// decides whether a code is valid, and it must never log one.
//
// Configure in the dashboard under Authentication -> Hooks -> Send SMS, and
// note it only fires while the Phone provider is enabled.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { otpSmsMessage } from "../_shared/cloudtalk.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature",
};

const CLOUDTALK_SMS_URL = "https://my.cloudtalk.io/api/sms/send.json";

interface SendSmsPayload {
  user: { id?: string; phone?: string };
  sms: { otp?: string };
}

/** Never log a whole number — enough to correlate a report, not to identify. */
function maskPhone(phone: string): string {
  return phone.length > 4 ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : "***";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  const keyId = Deno.env.get("CLOUDTALK_API_KEY_ID");
  const keySecret = Deno.env.get("CLOUDTALK_API_KEY_SECRET");
  const sender = Deno.env.get("CLOUDTALK_SMS_SENDER");

  if (!hookSecret || !keyId || !keySecret || !sender) {
    // Which one is missing matters a lot when this is being set up, and none of
    // these names are secret — only their values are.
    console.error("send-sms-hook is not configured", {
      hasHookSecret: !!hookSecret,
      hasKeyId: !!keyId,
      hasKeySecret: !!keySecret,
      hasSender: !!sender,
    });
    return new Response(JSON.stringify({ error: "SMS delivery is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: SendSmsPayload;
  try {
    // Supabase signs hook requests per the Standard Webhooks spec. Verifying is
    // what stops anyone who finds this URL from pushing arbitrary text to
    // arbitrary numbers on our CloudTalk account.
    const body = await req.text();
    const headers = Object.fromEntries(req.headers);
    const wh = new Webhook(hookSecret.replace("v1,whsec_", ""));
    payload = wh.verify(body, headers) as SendSmsPayload;
  } catch (error) {
    console.error("Rejected unverified SMS hook request", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const phone = payload?.user?.phone;
  const otp = payload?.sms?.otp;
  if (!phone || !otp) {
    console.error("SMS hook payload missing phone or otp");
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // CloudTalk wants international format on both numbers. Supabase stores the
  // phone without a leading "+", so put it back rather than having CloudTalk
  // reject it as a malformed recipient.
  const recipient = phone.startsWith("+") ? phone : `+${phone}`;

  // Shared with request-phone-otp so the two senders cannot drift, and so the
  // GSM-7 constraint documented there is stated in exactly one place.
  const message = otpSmsMessage(otp);

  let response: Response;
  try {
    response = await fetch(CLOUDTALK_SMS_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient,
        sender,
        message,
      }),
    });
  } catch (error) {
    console.error("CloudTalk request failed", {
      to: maskPhone(recipient),
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: "Could not reach the SMS provider" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!response.ok) {
    // Surfaced to the caller as a generic failure, but logged in full: a wrong
    // sender number or an unregistered destination country both land here, and
    // CloudTalk's body is the only thing that says which.
    const detail = await response.text().catch(() => "");
    console.error("CloudTalk rejected the SMS", {
      to: maskPhone(recipient),
      status: response.status,
      detail: detail.slice(0, 500),
    });
    return new Response(JSON.stringify({ error: "Could not send the verification code" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("Verification code sent", { to: maskPhone(recipient) });

  // Supabase treats an empty 200 as success.
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
