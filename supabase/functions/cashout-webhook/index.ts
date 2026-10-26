// Transak order webhooks. The body is { data: <JWT signed with our partner
// access token> }; anything that fails verification is dropped.
import { jsonResponse, serviceClient } from "../_shared/auth.ts";
import { cashoutStatus, partnerAccessToken, transakConfig, verifyHs256 } from "../_shared/transak.ts";
import { transakTokenStore } from "../_shared/transak-store.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const cfg = transakConfig((name) => Deno.env.get(name));
  if (!cfg) return jsonResponse({ error: "Not configured" }, 503);

  const body = await req.json().catch(() => ({}));
  const db = serviceClient();
  const store = transakTokenStore(db);
  const token = (await store.read())?.token ?? await partnerAccessToken(cfg, store);
  const claims = await verifyHs256(body?.data, token);
  if (!claims) return jsonResponse({ error: "Invalid signature" }, 401);

  const order = (claims.webhookData ?? claims) as Record<string, unknown>;
  const ours = String(order.partnerOrderId ?? "");
  if (!UUID.test(ours)) return jsonResponse({ ok: true, ignored: true });

  const fiatAmount = Number(order.fiatAmount);
  const update: Record<string, unknown> = {
    status: cashoutStatus(order.status),
    updated_at: new Date().toISOString(),
  };
  if (typeof order.id === "string") update.partner_order_id = order.id;
  if (typeof order.fiatCurrency === "string") update.fiat_currency = order.fiatCurrency.slice(0, 8);
  if (Number.isFinite(fiatAmount) && fiatAmount > 0) update.fiat_amount = fiatAmount;

  const { error } = await db.from("cashout_orders").update(update).eq("id", ours).eq("partner", "transak")
    // Webhooks can arrive out of order; a finished payout stays finished.
    .not("status", "in", "(completed,refunded)");
  if (error) {
    console.error("cashout webhook update failed", error.code);
    return jsonResponse({ error: "Update failed" }, 500);
  }
  return jsonResponse({ ok: true });
});
