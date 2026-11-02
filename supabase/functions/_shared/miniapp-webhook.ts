/**
 * Signed webhook delivery for mini apps (dehub.io/docs/webhooks).
 *
 * Every event is `POST { event, token }` to the app's manifest `webhookUrl`.
 * `token` is an ES256 JWT (typ "event") verified with the same JWKS as
 * sign-in. Each attempt is logged in miniapp_webhook_deliveries so the
 * developer can see it on /apps/dev. One retry after 3 s on a network error
 * or 5xx; an app that is down never blocks the person's action.
 */
import { signMiniAppToken } from "./miniapp-jwt.ts";

export const ACCOUNT_EVENTS = ["tip", "follow", "mention"] as const;
export const ALL_EVENTS = ["app_added", "app_removed", "payment", ...ACCOUNT_EVENTS, "ping"] as const;

export interface WebhookApp {
  id: string;
  domain: string;
  manifest: { webhookUrl?: string; webhookEvents?: string[] } | null;
}

export function publicHttps(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const h = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Account events are opt-in through `webhookEvents`; app events always go. */
export function wantsEvent(app: WebhookApp, event: string): boolean {
  if (!publicHttps(app.manifest?.webhookUrl)) return false;
  if (!(ACCOUNT_EVENTS as readonly string[]).includes(event)) return true;
  return Array.isArray(app.manifest?.webhookEvents) && app.manifest!.webhookEvents!.includes(event);
}

// deno-lint-ignore no-explicit-any
type Db = any;

export async function deliverWebhook(
  db: Db,
  app: WebhookApp,
  wallet: string,
  event: string,
  extra: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const url = publicHttps(app.manifest?.webhookUrl);
  if (!url) return { ok: false, status: null, error: "No https webhookUrl in the manifest." };
  const token = await signMiniAppToken({ sub: wallet, aud: app.domain, typ: "event", event, ...extra }, 3600);
  const body = JSON.stringify({ event, token });
  let status: number | null = null;
  let error: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "dehub-miniapp-webhook/1" },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      error = res.ok ? null : `Answered ${res.status}`;
      await res.body?.cancel().catch(() => {});
      if (res.status < 500) break;
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 200) : "Request failed";
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
  }
  const ok = status !== null && status >= 200 && status < 300;
  await db
    .from("miniapp_webhook_deliveries")
    .insert({ app_id: app.id, event, url, status, ok, error })
    .then(() => {}, () => {});
  return { ok, status, error };
}
