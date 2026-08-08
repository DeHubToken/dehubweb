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
