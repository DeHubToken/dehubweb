/**
 * miniapp-notify
 * ==============
 * A mini app's server sends its users a notification.
 *
 *   POST  Authorization: Bearer <notify key from /apps/dev>
 *   { notificationId, title, body, targetUrl?, wallets? }
 *
 * The key identifies the app; the app never holds per-user tokens (the thing
 * Farcaster developers most complain about managing). Delivery is DeHub's own
 * notification list, so it reaches web and the app alike.
 *
 * Only people who added the app and left its notifications on receive
 * anything. `wallets` narrows the send; without it, everyone who added the app
 * gets it (up to 1,000 a call).
 *
 * Limits, per app per person: one every 30 seconds, ten a day, and the same
 * notificationId at most once in 24 hours. Answers say who was sent to and
 * why anyone was skipped.
 */
import { handleCorsPreflight } from "../_shared/cors.ts";
import { jsonResponse, rateLimitByIp, serviceClient } from "../_shared/auth.ts";

const PER_CALL = 1000;
const MIN_GAP_MS = 30_000;
const PER_DAY = 10;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const limited = await rateLimitByIp(req, "miniapp-notify", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const key = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^dhmk_[a-f0-9]{48}$/.test(key)) return jsonResponse({ error: "A notify key is required: Authorization: Bearer dhmk_…" }, 401);

  try {
    const db = serviceClient();
    const { data: app } = await db
      .from("miniapp_apps")
      .select("id, slug, domain, name, icon_url, owner_wallet, status")
      .eq("notify_key_hash", await sha256Hex(key))
      .maybeSingle();
    if (!app) return jsonResponse({ error: "Unknown notify key." }, 401);
    if (app.status !== "live") return jsonResponse({ error: "This app is not live." }, 403);

    const body = await req.json().catch(() => ({}));
    const notificationId = clean(body?.notificationId, 128);
    const title = clean(body?.title, 32);
    const text = clean(body?.body, 128);
    if (!notificationId || !title) return jsonResponse({ error: "notificationId and title are required." }, 400);

    let targetUrl: string | null = null;
    if (body?.targetUrl) {
      try {
        const url = new URL(String(body.targetUrl));
        if (url.protocol !== "https:" || url.hostname !== app.domain) {
          return jsonResponse({ error: `targetUrl must be an https:// URL on ${app.domain}.` }, 400);
        }
        targetUrl = url.toString();
      } catch {
        return jsonResponse({ error: "targetUrl is not a URL." }, 400);
      }
    }

    const wanted = Array.isArray(body?.wallets)
      ? [...new Set(body.wallets.filter((w: unknown) => typeof w === "string").map((w: string) => w.toLowerCase()))]
          .filter((w) => /^0x[a-f0-9]{40}$/.test(w as string))
          .slice(0, PER_CALL)
      : null;

    let query = db.from("miniapp_installs").select("wallet").eq("app_id", app.id).eq("notifications_on", true);
    if (wanted) query = query.in("wallet", wanted as string[]);
    const { data: installs, error: installError } = await query.limit(PER_CALL);
    if (installError) throw installError;
    const recipients = (installs ?? []).map((r: { wallet: string }) => r.wallet);

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: recent } = recipients.length
      ? await db
          .from("miniapp_notification_log")
          .select("wallet, notification_id, sent_at")
          .eq("app_id", app.id)
          .in("wallet", recipients)
          .gte("sent_at", since)
      : { data: [] };

    const byWallet = new Map<string, { count: number; last: number; ids: Set<string> }>();
    for (const r of recent ?? []) {
      const e = byWallet.get(r.wallet) ?? { count: 0, last: 0, ids: new Set<string>() };
      e.count++;
      e.last = Math.max(e.last, Date.parse(r.sent_at));
      e.ids.add(r.notification_id);
      byWallet.set(r.wallet, e);
    }

    const now = Date.now();
    const send: string[] = [];
    const skipped = { duplicate: [] as string[], rateLimited: [] as string[] };
    for (const wallet of recipients) {
      const e = byWallet.get(wallet);
      if (e?.ids.has(notificationId)) skipped.duplicate.push(wallet);
      else if (e && (e.count >= PER_DAY || now - e.last < MIN_GAP_MS)) skipped.rateLimited.push(wallet);
      else send.push(wallet);
    }
    const notAdded = wanted ? (wanted as string[]).filter((w) => !recipients.includes(w)) : [];

    if (send.length) {
      const { error: logError } = await db
        .from("miniapp_notification_log")
        .insert(send.map((wallet) => ({ app_id: app.id, wallet, notification_id: notificationId })));
      if (logError) throw logError;
      const { error: notifyError } = await db.from("custom_notifications").insert(
        send.map((wallet) => ({
          recipient_address: wallet,
          actor_address: app.owner_wallet ?? "0x0000000000000000000000000000000000000000",
          actor_username: app.name,
          actor_avatar: app.icon_url,
          type: "miniapp",
          content: text ? `${title}: ${text}` : title,
          reference_id: app.slug,
          reference_title: targetUrl,
        })),
      );
      if (notifyError) throw notifyError;
    }

    return jsonResponse({ sent: send.length, sentTo: send, skipped: { ...skipped, notAdded } });
  } catch (error) {
    console.error("[miniapp-notify]", error);
    return jsonResponse({ error: "The send failed. Try again." }, 500);
  }
});
