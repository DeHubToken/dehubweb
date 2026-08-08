// Verifies a code issued by request-phone-otp, then signs the user into a
// real Supabase session without ever using Supabase's native phone-OTP path.
//
// There is no admin API to "sign in as user id X" directly, and no
// generateLink type covers phone. The trick: set a fresh random password on
// the user (created here on first phone login, or an existing one) under the
// service role, then immediately call signInWithPassword with an anon-key
// client. That returns a genuine access/refresh token pair through Supabase's
// own auth code, so RLS, refresh, everything downstream behaves exactly like
// a normal sign-in. The password is never sent to the client and gets
// overwritten on every login, so it's a one-shot credential rather than a
// standing one.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  serviceClient,
  callerIp,
  checkRateLimit,
} from "../_shared/auth.ts";
import { maskPhone } from "../_shared/cloudtalk.ts";

// See the matching comment in request-phone-otp: supabase-js only surfaces a
// body on 2xx, so every response here is 200 with { error } vs { session }.
function errorResponse(message: string): Response {
  return jsonResponse({ error: message }, 200);
}

const E164 = /^\+[1-9]\d{6,14}$/;
const OTP_DIGITS = /^\d{6}$/;
const MAX_ATTEMPTS = 5;
const PER_IP_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed");
  }

  let phone: string;
  let code: string;
  try {
    const body = await req.json();
    phone = String(body?.phone || "").trim();
    code = String(body?.code || "").trim();
  } catch {
    return errorResponse("Invalid request body");
  }

  if (!E164.test(phone) || !OTP_DIGITS.test(code)) {
    return errorResponse("Invalid phone or code");
  }

  const supabaseAdmin = serviceClient();

  const ipLimit = await checkRateLimit(supabaseAdmin, `ip:${callerIp(req)}`, "verify-phone-otp", PER_IP_LIMIT);
  if (!ipLimit.allowed) {
    return errorResponse("Too many attempts. Please try again later.");
  }

  const codeHash = await sha256Hex(code);
  const { data: consumed, error: consumeError } = await supabaseAdmin
    .rpc("consume_phone_otp", { p_phone: phone, p_code_hash: codeHash, p_max_attempts: MAX_ATTEMPTS })
    .single();

  if (consumeError) {
    console.error("verify-phone-otp: consume_phone_otp failed", consumeError);
    return errorResponse("Could not verify code. Please try again.");
  }

  const result = consumed as { valid: boolean; reason: string };
  if (!result.valid) {
    console.log("verify-phone-otp: rejected", { to: maskPhone(phone), reason: result.reason });
    const message =
      result.reason === "too_many_attempts"
        ? "Too many incorrect attempts. Request a new code."
        : result.reason === "expired"
          ? "Code expired. Request a new one."
          : "Incorrect code.";
    return errorResponse(message);
  }

  // Code was correct — find or create the auth user for this phone.
  const { data: existingUserId, error: lookupError } = await supabaseAdmin.rpc("get_user_id_by_phone", {
    p_phone: phone,
  });
  if (lookupError) {
    console.error("verify-phone-otp: get_user_id_by_phone failed", lookupError);
    return errorResponse("Sign-in failed. Please try again.");
  }

  // Plain randomUUID() is lowercase hex only — if the project's password
  // policy requires upper/lower/digit/symbol, that silently fails createUser
  // /updateUserById and collapses to the generic "Sign-in failed" below.
  // Forcing one of each satisfies any policy this project could reasonably have.
  const oneShotPassword = `Aa1!${crypto.randomUUID()}`;

  if (existingUserId) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUserId, {
      password: oneShotPassword,
    });
    if (updateError) {
      console.error("verify-phone-otp: updateUserById failed", updateError);
      return errorResponse("Sign-in failed. Please try again.");
    }
  } else {
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      password: oneShotPassword,
    });
    if (createError) {
      console.error("verify-phone-otp: createUser failed", createError);
      return errorResponse("Sign-in failed. Please try again.");
    }
  }

  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    phone,
    password: oneShotPassword,
  });
  if (signInError || !signInData?.session) {
    console.error("verify-phone-otp: signInWithPassword failed", signInError);
    return errorResponse("Sign-in failed. Please try again.");
  }

  console.log("verify-phone-otp: signed in", { to: maskPhone(phone) });
  return new Response(JSON.stringify({ session: signInData.session }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
