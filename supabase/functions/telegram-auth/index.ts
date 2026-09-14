// Telegram login — verifies a Telegram Login Widget payload and hands back a
// real Supabase session.
//
// Telegram is not a Supabase Auth provider and never will be: there is no
// OAuth 2 endpoint to point GoTrue at. What Telegram gives a website instead
// is a blob of profile fields (id, first_name, username, photo_url, auth_date)
// plus an HMAC over them, keyed on SHA-256 of the bot token. Anyone holding the
// bot token can verify it; nobody without it can forge one. That verification
// is this function's whole reason to exist — it is the only place the bot
// token lives.
//
// Once the blob checks out, the session is minted exactly the way
// verify-phone-otp does it, and for the same reason: there is no admin
// "sign in as user X" API. Set a fresh one-shot password on the user under the
// service role, then immediately spend it through an anon-key client, which
// returns a genuine access/refresh pair out of Supabase's own auth code. The
// password never reaches the client and is overwritten on every login.
//
// GET returns the public half of the config (bot id + username) so the clients
// can render the button without a build-time env var and without a redeploy
// when the bot changes. Nothing secret is in that response.
//
// Env:
//   TELEGRAM_LOGIN_BOT_TOKEN    – full BotFather token, "<bot_id>:<secret>"
//   TELEGRAM_LOGIN_BOT_USERNAME – optional, for the button label / deep links
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
import { authDateIsFresh, decodeTgAuthResult, parseBotToken, verifyTelegramPayload } from "./verify.ts";

// Same shape as the phone pair: supabase-js only surfaces a body on 2xx, so
// every failure is a 200 carrying { error } rather than a status the client
// would only ever see as "FunctionsHttpError".
function errorResponse(message: string): Response {
  return jsonResponse({ error: message }, 200);
}

const PER_IP_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };

/**
 * The configured bot, or null when the secret is absent or not a bot token.
 *
 * The warning matters as much as the parse: a secret that is set but wrong
 * otherwise produces a feature that looks configured and fails for everyone,
 * with nothing anywhere saying why.
 */
function bot(): { token: string; botId: string } | null {
  const raw = Deno.env.get("TELEGRAM_LOGIN_BOT_TOKEN");
  const parsed = parseBotToken(raw);
  if (!parsed && raw?.trim()) {
    console.error("telegram-auth: TELEGRAM_LOGIN_BOT_TOKEN is set but is not a bot token — expected <bot_id>:<secret>");
  }
  return parsed;
}

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const configured = bot();

  // Public config. Answers even when unconfigured — `enabled: false` is what
  // keeps the button off the login sheet, rather than a build-time flag.
  if (req.method === "GET") {
    return jsonResponse({
      enabled: !!configured,
      botId: configured?.botId ?? null,
      botUsername: Deno.env.get("TELEGRAM_LOGIN_BOT_USERNAME")?.trim().replace(/^@/, "") || null,
    });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed");
  }

  if (!configured) {
    return errorResponse("Telegram login is not available right now.");
  }
  const token = configured.token;

  let payload: Record<string, unknown> | null;
  try {
    const body = await req.json();
    // Telegram's redirect hands back base64 of the JSON; a caller holding the
    // fields as an object can send those instead. Accept either, so the
    // clients do not have to agree on which one they used.
    payload = typeof body?.tgAuthResult === "string"
      ? decodeTgAuthResult(body.tgAuthResult)
      : (body?.payload ?? body);
  } catch {
    return errorResponse("Invalid request body");
  }

  if (!payload || typeof payload !== "object") {
    return errorResponse("Invalid Telegram response");
  }

  const telegramId = String(payload.id || "").trim();
  if (!/^\d{1,20}$/.test(telegramId)) {
    return errorResponse("Invalid Telegram response");
  }

  const supabaseAdmin = serviceClient();
  const ipLimit = await checkRateLimit(supabaseAdmin, `ip:${callerIp(req)}`, "telegram-auth", PER_IP_LIMIT);
  if (!ipLimit.allowed) {
    return errorResponse("Too many attempts. Please try again later.");
  }

  if (!(await verifyTelegramPayload(payload, token))) {
    console.log("telegram-auth: signature rejected", { id: telegramId });
    return errorResponse("Could not verify your Telegram login. Please try again.");
  }

  if (!authDateIsFresh(payload.auth_date)) {
    return errorResponse("This Telegram login has expired. Please try again.");
  }

  // Deterministic, and derived only from the numeric id — a Telegram @username
  // can be changed or given away, so linking on it would hand an account to
  // whoever picked the handle up next.
  const syntheticEmail = "tg" + telegramId + "@telegram.dehub.internal";

  const first = String(payload.first_name || "").trim();
  const last = String(payload.last_name || "").trim();
  const username = String(payload.username || "").trim();
  const photo = String(payload.photo_url || "").trim();
  const displayName = [first, last].filter(Boolean).join(" ");
  const metadata: Record<string, string> = {
    provider: "telegram",
    telegram_id: telegramId,
    ...(username ? { telegram_username: username, user_name: username } : {}),
    ...(displayName ? { full_name: displayName, name: displayName } : {}),
    // Telegram serves these from its own CDN and they expire, which is why the
    // app copies the picture at signup rather than hotlinking it forever.
    ...(photo.startsWith("https://") ? { avatar_url: photo, picture: photo } : {}),
  };

  const { data: existingUserId, error: lookupError } = await supabaseAdmin.rpc("get_user_id_by_email", {
    p_email: syntheticEmail,
  });
  if (lookupError) {
    console.error("telegram-auth: get_user_id_by_email failed", lookupError);
    return errorResponse("Sign-in failed. Please try again.");
  }

  // Plain randomUUID() is lowercase hex only, which a password policy asking
  // for mixed case or a symbol rejects — silently, as a generic admin-API
  // error. The prefix satisfies any policy this project could have.
  const oneShotPassword = "Aa1!" + crypto.randomUUID();

  if (existingUserId) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUserId, {
      password: oneShotPassword,
      user_metadata: metadata,
    });
    if (updateError) {
      console.error("telegram-auth: updateUserById failed", updateError);
      return errorResponse("Sign-in failed. Please try again.");
    }
  } else {
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      password: oneShotPassword,
      user_metadata: metadata,
    });
    if (createError) {
      console.error("telegram-auth: createUser failed", createError);
      return errorResponse("Sign-in failed. Please try again.");
    }
  }

  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: syntheticEmail,
    password: oneShotPassword,
  });
  if (signInError || !signInData?.session) {
    console.error("telegram-auth: signInWithPassword failed", signInError);
    return errorResponse("Sign-in failed. Please try again.");
  }

  console.log("telegram-auth: signed in", { id: telegramId, isNew: !existingUserId });
  return new Response(JSON.stringify({ session: signInData.session, profile: metadata }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
