// Generates and sends a phone-login OTP via CloudTalk, standing in for
// Supabase's native Phone + Send SMS Hook flow — see the migration comment on
// public.phone_otp_codes for why. Paired with verify-phone-otp.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  serviceClient,
  callerIp,
  checkRateLimit,
} from "../_shared/auth.ts";
import {
  getCloudTalkCredentials,
  sendCloudTalkSms,
  maskPhone,
  otpSmsMessage,
} from "../_shared/cloudtalk.ts";

// supabase-js's functions.invoke() only surfaces a body on 2xx responses —
// a non-2xx collapses to a generic "Edge Function returned a non-2xx status
// code" with the real message buried in error.context, which the mobile
// client here doesn't parse (matching this codebase's existing convention,
// e.g. fetchAgoraToken's `data?.error` check). So every response, including
// failures, is 200 with { error } vs { success: true }.
function errorResponse(message: string): Response {
  return jsonResponse({ error: message }, 200);
}

const E164 = /^\+[1-9]\d{6,14}$/;
const OTP_TTL_MS = 60_000; // matches the dashboard's SMS OTP expiry setting
const PER_PHONE_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };
const PER_IP_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateOtp(): string {
  // crypto-random, not Math.random — this gates a real sign-in.
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed");
  }

  let phone: string;
  try {
    const body = await req.json();
    phone = String(body?.phone || "").trim();
  } catch {
    return errorResponse("Invalid request body");
  }

  if (!E164.test(phone)) {
    return errorResponse("Phone must be in international format, e.g. +14155552671");
  }

  const creds = getCloudTalkCredentials();
  if (!creds) {
    console.error("request-phone-otp is not configured", {
      hasKeyId: !!Deno.env.get("CLOUDTALK_API_KEY_ID"),
      hasKeySecret: !!Deno.env.get("CLOUDTALK_API_KEY_SECRET"),
      hasSender: !!Deno.env.get("CLOUDTALK_SMS_SENDER"),
    });
    return errorResponse("SMS delivery is not configured");
  }

  const supabase = serviceClient();

  const ipLimit = await checkRateLimit(supabase, `ip:${callerIp(req)}`, "request-phone-otp", PER_IP_LIMIT);
  if (!ipLimit.allowed) {
    return errorResponse("Too many requests. Please try again later.");
  }
  const phoneLimit = await checkRateLimit(supabase, `phone:${phone}`, "request-phone-otp", PER_PHONE_LIMIT);
  if (!phoneLimit.allowed) {
    return errorResponse("Too many codes requested for this number. Please try again later.");
  }

  const code = generateOtp();
  const codeHash = await sha256Hex(code);

  const { error: rpcError } = await supabase.rpc("upsert_phone_otp", {
    p_phone: phone,
    p_code_hash: codeHash,
    p_ttl_ms: OTP_TTL_MS,
  });
  if (rpcError) {
    console.error("request-phone-otp: upsert_phone_otp failed", rpcError);
    return errorResponse("Could not generate a verification code. Please try again.");
  }

  const sms = await sendCloudTalkSms(creds, phone, otpSmsMessage(code));
  if (!sms.ok) {
    console.error("request-phone-otp: CloudTalk send failed", {
      to: maskPhone(phone),
      status: sms.status,
      detail: sms.detail,
    });
    return errorResponse("Could not send the verification code");
  }

  console.log("request-phone-otp: code sent", { to: maskPhone(phone) });
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
