// Texts one activity notification through CloudTalk.
//
// The SMS twin of notification-email-send, and it exists for the same reason:
// the droplet holds no provider credentials. Every decision about *whether* to
// send — the opt-in, the eligible-type list, the cooldown, the daily cap, and
// above all the charge — is made by the NestJS backend's NotificationSmsService
// in Mongo, where the account, its verified number and its DHB balance live.
// By the time a request reaches here the reader has already been debited. This
// function is only the delivery leg and is deliberately dumb.
//
// Authenticated with the same EMAIL_LINK_SERVICE_SECRET the mail path already
// uses (x-email-link-secret header) — one secret for one caller across one
// trust boundary, rather than a second one to set in two places and forget in
// one. Not a Supabase JWT, so verify_jwt is off in config.toml.
//
// ## Why the length check is here as well as in the backend
//
// CloudTalk bills per fragment: 160 characters of GSM-7, or 70 if a single
// character falls outside that alphabet. The backend builds every message to
// fit one fragment and refuses to send anything that would not. This checks it
// again anyway, because this is the side holding the prepaid balance — a bug
// upstream should cost a dropped notification, not a doubled bill on every
// message until somebody reads the invoice.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient, checkRateLimit } from "../_shared/auth.ts";
import {
  getCloudTalkCredentials,
  sendCloudTalkSms,
  maskPhone,
} from "../_shared/cloudtalk.ts";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const E164 = /^\+[1-9]\d{6,14}$/;

/** One GSM-7 fragment. Anything longer is refused rather than sent at 2x. */
const MAX_MESSAGE_LENGTH = 160;

/**
 * A ceiling on the whole platform's notification texts per day.
 *
 * Not a per-account limit — the backend owns those, and a reader who has paid
 * for their messages should get them. This is the blast radius if the shared
 * secret ever leaks: an attacker with it could otherwise empty the prepaid
 * CloudTalk balance overnight, exactly the way request-phone-otp's global cap
 * exists to stop the login path being pumped.
 *
 * Tripping it means either real scale — raise NOTIFICATION_SMS_DAILY_CAP — or
 * somebody else holding our secret. Both are worth being told about, and both
 * are better found by a paused channel than by an empty balance.
 */
function dailyCap(): number {
  const parsed = Number(Deno.env.get("NOTIFICATION_SMS_DAILY_CAP"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const secret = Deno.env.get("EMAIL_LINK_SERVICE_SECRET");
  if (!secret) {
    console.error("EMAIL_LINK_SERVICE_SECRET not configured");
    return json(500, { error: "Not configured" });
  }
  if (req.headers.get("x-email-link-secret") !== secret) {
    return json(401, { error: "Unauthorized" });
  }

  const creds = getCloudTalkCredentials();
  if (!creds) {
    console.error("CloudTalk credentials not configured");
    return json(500, { error: "Not configured" });
  }

  let payload: { to?: string; message?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const to = (payload.to || "").trim();
  if (!E164.test(to)) {
    return json(400, { error: "Invalid phone number" });
  }

  const message = (payload.message || "").trim();
  if (!message) {
    return json(400, { error: "Missing message" });
  }
  if ([...message].length > MAX_MESSAGE_LENGTH) {
    // Refused, not truncated. Truncating would send a message whose tail — the
    // link, in every notification — is the part the reader needed.
    console.error(`[sms] refusing a ${[...message].length} character message`);
    return json(400, { error: "Message exceeds one fragment" });
  }

  const supabase = serviceClient();
  const capped = await checkRateLimit(supabase, "global", "notification_sms", {
    limit: dailyCap(),
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!capped.allowed) {
    console.error(`[sms] daily cap reached, resets ${capped.resetAt.toISOString()}`);
    return json(429, { error: "Daily message cap reached" });
  }

  const result = await sendCloudTalkSms(creds, to, message);
  if (!result.ok) {
    // Logged with the number masked — enough to correlate a report, not enough
    // to identify the reader from a log line.
    console.error(`[sms] send failed to ${maskPhone(to)}: ${result.detail}`);
    return json(502, { error: "Send failed" });
  }

  console.log(`[sms] sent to ${maskPhone(to)}`);
  return json(200, { sent: true });
});
