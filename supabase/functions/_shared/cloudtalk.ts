// CloudTalk SMS sending, shared between send-sms-hook (the native Auth Hook
// path, dormant until Authentication -> Hooks -> Send SMS can be enabled) and
// the custom request-phone-otp/verify-phone-otp flow that stands in for it.

const CLOUDTALK_SMS_URL = "https://my.cloudtalk.io/api/sms/send.json";

export interface CloudTalkCredentials {
  keyId: string;
  keySecret: string;
  sender: string;
}

export function getCloudTalkCredentials(): CloudTalkCredentials | null {
  const keyId = Deno.env.get("CLOUDTALK_API_KEY_ID");
  const keySecret = Deno.env.get("CLOUDTALK_API_KEY_SECRET");
  const sender = Deno.env.get("CLOUDTALK_SMS_SENDER");
  if (!keyId || !keySecret || !sender) return null;
  return { keyId, keySecret, sender };
}

/** Never log a whole number — enough to correlate a report, not to identify. */
export function maskPhone(phone: string): string {
  return phone.length > 4 ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : "***";
}

/**
 * The one and only OTP text. It lives here because both senders need it
 * identical, and because it has a constraint that is invisible at the call
 * site: every character must exist in the GSM-7 alphabet. A single character
 * outside it (an em dash, a curly quote, an accent) switches the whole message
 * to UCS-2, where a fragment holds 70 characters instead of 160. At 87
 * characters this is one GSM-7 fragment; under UCS-2 the same text is two.
 * CloudTalk bills per fragment, and several destinations reject multi-part
 * messages outright, so keep this plain ASCII.
 */
export function otpSmsMessage(code: string): string {
  return `${code} is your DeHub verification code. It expires shortly. ` +
    `Don't share it with anyone.`;
}

export type SendSmsResult = { ok: true } | { ok: false; status?: number; detail: string };

export async function sendCloudTalkSms(
  creds: CloudTalkCredentials,
  recipient: string,
  message: string,
): Promise<SendSmsResult> {
  let response: Response;
  try {
    response = await fetch(CLOUDTALK_SMS_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${creds.keyId}:${creds.keySecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient, sender: creds.sender, message }),
    });
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, status: response.status, detail: detail.slice(0, 500) };
  }

  return { ok: true };
}
