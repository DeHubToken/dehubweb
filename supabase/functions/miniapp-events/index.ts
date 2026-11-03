/**
 * miniapp-events
 * ==============
 * Account events for mini app webhooks: when the wallet that owns an app is
 * tipped, followed or mentioned on Riftn, its apps that listed the event in
 * the manifest's `webhookEvents` get a signed webhook (see
 * _shared/miniapp-webhook.ts). Called by the Riftn API, never by browsers.
 *
 * GET                                   → { wallets }: owners with at least one
 *                                         app that wants an account event, so
 *                                         the API only calls in for them
 * POST { wallet, event, actor?, ... }   → delivers to that owner's apps
 *
 * Both need x-internal-secret = INTERNAL_SERVICE_SECRET.
 */
import { jsonResponse, serviceClient } from "../_shared/auth.ts";
import { ACCOUNT_EVENTS, deliverWebhook, wantsEvent, type WebhookApp } from "../_shared/miniapp-webhook.ts";

function allowed(req: Request): boolean {
  const secret = Deno.env.get("INTERNAL_SERVICE_SECRET");
  const got = req.headers.get("x-internal-secret") ?? "";
  if (!secret || got.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

const WALLET = /^0x[a-f0-9]{40}$/;

Deno.serve(async (req) => {
  if (!allowed(req)) return jsonResponse({ error: "unauthorized" }, 401);
  const db = serviceClient();
  try {
    if (req.method === "GET") {
      const { data, error } = await db
        .from("miniapp_apps")
        .select("id, domain, owner_wallet, manifest")
        .eq("status", "live")
        .not("owner_wallet", "is", null)
        .not("manifest->>webhookUrl", "is", null);
      if (error) throw error;
      const wallets = new Set<string>();
      for (const app of (data ?? []) as (WebhookApp & { owner_wallet: string })[]) {
        if (ACCOUNT_EVENTS.some((e) => wantsEvent(app, e))) wallets.add(app.owner_wallet);
      }
      return jsonResponse({ wallets: [...wallets] });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const wallet = String(body.wallet ?? "").toLowerCase();
      const event = String(body.event ?? "");
      if (!WALLET.test(wallet) || !(ACCOUNT_EVENTS as readonly string[]).includes(event)) {
        return jsonResponse({ error: "wallet and a known event are required" }, 400);
      }
      const extra: Record<string, unknown> = {};
      if (typeof body.actor === "string" && WALLET.test(body.actor.toLowerCase())) extra.actor = body.actor.toLowerCase();
      if (typeof body.actorUsername === "string") extra.actorUsername = body.actorUsername.slice(0, 64);
      if (Number.isFinite(Number(body.tokenId)) && body.tokenId != null) extra.postId = Number(body.tokenId);
      if (Number.isFinite(Number(body.amount)) && body.amount != null) extra.amount = Number(body.amount);
      if (typeof body.currency === "string") extra.currency = body.currency.slice(0, 16);

      const { data, error } = await db
        .from("miniapp_apps")
        .select("id, domain, manifest")
        .eq("status", "live")
        .eq("owner_wallet", wallet);
      if (error) throw error;
      const apps = ((data ?? []) as WebhookApp[]).filter((app) => wantsEvent(app, event));
      // The person on the other end of the event is the owner (sub = owner wallet).
      const results = await Promise.all(apps.map((app) => deliverWebhook(db, app, wallet, event, extra)));
      return jsonResponse({ delivered: results.filter((r) => r.ok).length, apps: apps.length });
    }
    return jsonResponse({ error: "GET or POST only" }, 405);
  } catch (e) {
    console.error("[miniapp-events]", e);
    return jsonResponse({ error: "failed" }, 500);
  }
});
