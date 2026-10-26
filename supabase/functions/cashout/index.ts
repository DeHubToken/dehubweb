// Bank cash-out. `config` tells the client whether the partner is set up;
// `start` records an order and returns a one-time Transak sell widget URL;
// `history` lists the caller's orders. Status updates arrive at cashout-webhook.
import { handleCorsPreflight, jsonResponse, requireDeHubAuth, serviceClient, checkRateLimit } from "../_shared/auth.ts";
import {
  CASHOUT_ASSETS, MAX_CASHOUT, MIN_CASHOUT, createWidgetUrl, parseCashoutRequest,
  partnerAccessToken, sellWidgetParams, transakConfig,
} from "../_shared/transak.ts";
import { transakTokenStore } from "../_shared/transak-store.ts";

const APP_ORIGIN = Deno.env.get("CASHOUT_RETURN_ORIGIN") || "https://dehub.io";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const cfg = transakConfig((name) => Deno.env.get(name));

  if (body?.action === "config") {
    return jsonResponse({
      enabled: !!cfg,
      partner: "transak",
      min: MIN_CASHOUT,
      max: MAX_CASHOUT,
      networks: Object.entries(CASHOUT_ASSETS).map(([id, a]) => ({ id, ...a })),
    });
  }

  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const db = serviceClient();

  if (body?.action === "history") {
    const { data, error } = await db.from("cashout_orders")
      .select("id, partner, partner_order_id, crypto_currency, network, crypto_amount, fiat_currency, fiat_amount, status, created_at, updated_at")
      .eq("wallet", auth.wallet).order("created_at", { ascending: false }).limit(25);
    if (error) return jsonResponse({ error: "Could not load cash-outs." }, 500);
    return jsonResponse({ orders: data ?? [] });
  }

  if (body?.action !== "start") return jsonResponse({ error: "Unknown action" }, 400);
  if (!cfg) return jsonResponse({ error: "Cash out is not available yet.", code: "CASHOUT_DISABLED" }, 503);

  const input = parseCashoutRequest(body);
  if (!input) return jsonResponse({ error: `Enter an amount between ${MIN_CASHOUT} and ${MAX_CASHOUT}.` }, 400);

  const rl = await checkRateLimit(db, auth.wallet, "cashout-start", { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return jsonResponse({ error: "Too many cash-out attempts. Try again later." }, 429);

  const { data: order, error } = await db.from("cashout_orders").insert({
    wallet: auth.wallet, partner: "transak", crypto_currency: CASHOUT_ASSETS[input.network].currency,
    network: input.network, crypto_amount: input.amount,
  }).select("id").single();
  if (error || !order) return jsonResponse({ error: "Could not start cash out." }, 500);

  const params = sellWidgetParams(cfg, {
    orderId: order.id, wallet: auth.wallet, amount: input.amount, network: input.network,
    redirectURL: `${APP_ORIGIN}/app/command-centre?cashout=${order.id}`,
  });
  const store = transakTokenStore(db);
  try {
    let url: string;
    try {
      url = await createWidgetUrl(cfg, await partnerAccessToken(cfg, store), params);
    } catch (err) {
      // A token revoked elsewhere: refresh once and retry.
      if ((err as { status?: number }).status !== 401) throw err;
      url = await createWidgetUrl(cfg, await partnerAccessToken(cfg, store, true), params);
    }
    return jsonResponse({ id: order.id, url });
  } catch (err) {
    console.error("cashout start failed", (err as Error).message);
    await db.from("cashout_orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", order.id);
    return jsonResponse({ error: "The payout partner is unavailable. Try again shortly." }, 502);
  }
});
