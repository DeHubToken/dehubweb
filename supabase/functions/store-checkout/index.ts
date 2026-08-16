/**
 * Store Checkout — the card rail
 * ==============================
 * Quote, open a Stripe Checkout Session, and report its status.
 *
 * Deliberately a separate function from `live-checkout` rather than another
 * action on it. live-checkout is the crypto rail: it reads an on-chain receipt
 * and its whole contract is "verify a DHB Transfer". This one holds stock,
 * opens a PaymentIntent and reasons in integer cents. Sharing a file would put
 * two different notions of "confirm" behind one dispatch, and both rails have
 * to keep working while the other is edited.
 *
 * The money model is Stripe Connect Express with SEPARATE CHARGES AND
 * TRANSFERS. The charge lands on DeHub's marketplace balance; the seller's cut
 * is transferred to their connected account 30 days later, when they withdraw.
 * The hold is therefore the natural state of the money rather than a scheduled
 * job — nothing has to run on day 30 for the design to be correct.
 *
 * Card is refused for digital goods, on the server, for three reasons at once:
 * the App Store's physical-goods exemption; instant fulfilment with no shipping
 * evidence is the bust-out vector; and `store_listings.digital_file_url` sits on
 * a table whose SELECT policy is `USING (true)` beside a public bucket, so every
 * digital good is already downloadable without paying — a guaranteed-win "not
 * as described" for any buyer who notices.
 */

import {
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from "../_shared/auth.ts";
import { createMarketplaceStripeClient, type StripeEnv } from "../_shared/stripe.ts";

/** Stripe's own floor is 50c; $2 keeps the fee from eating the sale. */
const MIN_CHARGE_CENTS = 200;
const MAX_CHARGE_CENTS = 10_000_00;
/** Platform take, in basis points. 500 = 5%. */
const PLATFORM_FEE_BPS = 500;
/** Checkout Sessions expire at 30m; the stock hold outlives that by 10m. */
const SESSION_TTL_MINUTES = 30;
const HOLD_TTL_MINUTES = 40;

function stripeEnv(): StripeEnv {
  // The environment is a server-side deployment fact, never a request field.
  // create-checkout lets the CALLER pick which key the server signs with, which
  // is tolerable when the worst case is gifting premium and unacceptable when
  // the wallet decides who gets credited.
  return Deno.env.get("STRIPE_MARKETPLACE_MODE") === "sandbox" ? "sandbox" : "live";
}

function siteOrigin(req: Request): string {
  const configured = Deno.env.get("PUBLIC_SITE_URL");
  if (configured) return configured.replace(/\/$/, "");
  const origin = req.headers.get("origin");
  // Only ever our own origin: this string ends up in success_url, and an
  // attacker-supplied one would redirect the buyer off-platform after paying.
  if (origin && /^https:\/\/([a-z0-9-]+\.)*dehub\.(io|net)$/.test(origin)) return origin;
  return "https://dehub.io";
}

/** Fail-closed rate limit. The helper in _shared/auth.ts returns allowed on error. */
async function rateLimitStrict(
  supabase: ReturnType<typeof serviceClient>,
  bucket: string,
  action: string,
  windowMs: number,
  limit: number,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("edge_rate_limit_bump", {
      p_bucket: bucket,
      p_action: action,
      p_window_ms: windowMs,
      p_limit: limit,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

interface CardQuote {
  listingId: string;
  title: string;
  priceUsd: number;
  grossCents: number;
  platformFeeCents: number;
  netCents: number;
  sellerAddress: string;
  isDigital: boolean;
  available: boolean;
  unavailableReason?:
    | "seller_not_onboarded"
    | "digital_goods"
    | "below_minimum"
    | "above_maximum"
    | "sold_out"
    | "inactive"
    | "own_listing";
}

/**
 * Price a listing the way the rail displays it, in cents, and say whether card
 * is actually offerable. Mirrors live-checkout's quoteFor for the listing and
 * stream-membership parts so the two rails can never disagree about the price.
 */
async function quoteCard(
  supabase: ReturnType<typeof serviceClient>,
  env: StripeEnv,
  tokenId: string,
  listingId: string,
  buyer: string,
): Promise<{ error: string; status: number } | CardQuote> {
  const { data: listing } = await supabase
    .from("store_listings")
    .select("id, wallet_address, title, price, status, stock_quantity, is_digital")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing) return { error: "Listing not found", status: 404 };

  const sellerAddress = String(listing.wallet_address).toLowerCase();

  let livePrice: number | null = null;
  if (tokenId) {
    const { data: attached } = await supabase
      .from("stream_products")
      .select("live_price")
      .eq("token_id", tokenId)
      .eq("listing_id", listingId)
      .maybeSingle();
    if (!attached) return { error: "That item is not on this stream", status: 404 };
    livePrice = attached.live_price;
  }

  const priceUsd = Number(livePrice ?? listing.price);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return { error: "This item has no valid price", status: 409 };
  }

  // round() not floor(): 19.995 must not become 1999 while the order says 20.00.
  const grossCents = Math.round(priceUsd * 100);
  const platformFeeCents = Math.round((grossCents * PLATFORM_FEE_BPS) / 10_000);
  const netCents = grossCents - platformFeeCents;

  const base = {
    listingId,
    title: String(listing.title),
    priceUsd,
    grossCents,
    platformFeeCents,
    netCents,
    sellerAddress,
    isDigital: !!listing.is_digital,
  };

  const unavailable = (reason: CardQuote["unavailableReason"]): CardQuote =>
    ({ ...base, available: false, unavailableReason: reason });

  if (listing.status !== "active") return unavailable("inactive");
  if (listing.stock_quantity === 0) return unavailable("sold_out");
  if (sellerAddress === buyer) return unavailable("own_listing");
  if (listing.is_digital) return unavailable("digital_goods");
  if (grossCents < MIN_CHARGE_CENTS) return unavailable("below_minimum");
  if (grossCents > MAX_CHARGE_CENTS) return unavailable("above_maximum");

  // The seller must be able to receive money before we take any. Read live
  // rather than trusted from onboarding: an account can fall out of
  // verification at any time, and a balance that can never be transferred is
  // worse than no card button.
  const { data: account } = await supabase
    .from("seller_payout_accounts")
    .select("stripe_account_id, payouts_enabled, charges_enabled, lifetime_cap_cents, first_payout_at")
    .eq("wallet_address", sellerAddress)
    .eq("environment", env)
    .maybeSingle();

  if (!account || !account.payouts_enabled) return unavailable("seller_not_onboarded");

  return { ...base, available: true };
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const buyer = auth.wallet;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = String(body.action || "");
  const env = stripeEnv();
  const supabase = serviceClient();

  try {
    // ── status ────────────────────────────────────────────────────────────
    // Polled by the return page. Reads our own row, never Stripe: the webhook
    // is what makes a payment real, and letting the client's poll settle an
    // order would mean two settlement paths racing on one PaymentIntent.
    if (action === "status") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId) return jsonResponse({ error: "sessionId is required" }, 400);

      const { data: intent } = await supabase
        .from("store_card_intents")
        .select("status, order_id, settle_warning, gross_cents, buyer_address, listing_id")
        .eq("environment", env)
        .eq("stripe_session_id", sessionId)
        .maybeSingle();

      if (!intent) return jsonResponse({ error: "Unknown checkout session" }, 404);
      if (String(intent.buyer_address).toLowerCase() !== buyer) {
        return jsonResponse({ error: "That checkout is not yours" }, 403);
      }

      return jsonResponse({
        status: intent.status,
        orderId: intent.order_id,
        warning: intent.settle_warning,
        amountUsd: Number(intent.gross_cents) / 100,
        listingId: intent.listing_id,
      });
    }

    const tokenId = body.tokenId == null ? "" : String(body.tokenId);
    const listingId = String(body.listingId || "");
    if (!listingId) return jsonResponse({ error: "listingId is required" }, 400);

    const quote = await quoteCard(supabase, env, tokenId, listingId, buyer);
    if ("error" in quote) return jsonResponse({ error: quote.error }, quote.status);

    // ── quote ─────────────────────────────────────────────────────────────
    if (action === "quote") {
      return jsonResponse({
        listingId: quote.listingId,
        title: quote.title,
        priceUsd: quote.priceUsd,
        grossCents: quote.grossCents,
        available: quote.available,
        unavailableReason: quote.unavailableReason ?? null,
        currency: "usd",
      });
    }

    // ── create_session ────────────────────────────────────────────────────
    if (action === "create_session") {
      if (!quote.available) {
        // The client gate is cosmetic — is_digital is a seller-flipped switch
        // and a stale tab can hold a quote taken before it changed.
        return jsonResponse(
          { error: "Card payment is not available for this item", reason: quote.unavailableReason },
          400,
        );
      }

      const allowed = await rateLimitStrict(
        supabase, `card:${buyer}`, "store_card_session", 60 * 60 * 1000, 20,
      );
      if (!allowed) {
        return jsonResponse({ error: "Too many checkout attempts. Try again later." }, 429);
      }

      const shippingAddress = String(body.shippingAddress || "").trim();
      if (!shippingAddress) {
        return jsonResponse({ error: "A shipping address is required" }, 400);
      }

      const { data: account } = await supabase
        .from("seller_payout_accounts")
        .select("stripe_account_id")
        .eq("wallet_address", quote.sellerAddress)
        .eq("environment", env)
        .maybeSingle();
      if (!account) return jsonResponse({ error: "Seller cannot accept cards" }, 400);

      // The intent row exists before Stripe does. Its id is the stock-hold ref
      // and the session's idempotency key, so a retry of this whole request
      // cannot open a second PaymentIntent or take a second unit of stock.
      const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60_000).toISOString();
      const { data: intent, error: intentErr } = await supabase
        .from("store_card_intents")
        .insert({
          environment: env,
          listing_id: listingId,
          buyer_address: buyer,
          seller_address: quote.sellerAddress,
          stream_token_id: tokenId || null,
          gross_cents: quote.grossCents,
          platform_fee_cents: quote.platformFeeCents,
          net_cents: quote.netCents,
          shipping_address: shippingAddress,
          notes: String(body.notes || "").trim() || null,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (intentErr || !intent) throw intentErr ?? new Error("intent insert failed");

      // Stock comes off NOW, not at settlement. On the crypto rail an oversell
      // was survivable; here DeHub charged the card, so 200 buyers racing one
      // unit means 199 real refunds and 199 "not received" disputes.
      const holdRef = `sci:${intent.id}`;
      const { error: holdErr } = await supabase.rpc("store_stock_hold_create", {
        p_listing_id: listingId,
        p_hold_ref: holdRef,
        p_ttl_minutes: HOLD_TTL_MINUTES,
      });
      if (holdErr) {
        await supabase.from("store_card_intents")
          .update({ status: "failed" }).eq("id", intent.id);
        const soldOut = String(holdErr.message || "").includes("out_of_stock");
        return jsonResponse(
          { error: soldOut ? "Sold out" : "Could not reserve this item" },
          soldOut ? 409 : 500,
        );
      }

      const origin = siteOrigin(req);
      const stripe = createMarketplaceStripeClient(env);

      let session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: "payment",
          // Separate charges and transfers: no transfer_data here on purpose.
          // The money stays on the platform balance until the seller withdraws.
          line_items: [{
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: quote.grossCents,
              product_data: {
                name: quote.title.slice(0, 250),
                metadata: { listing_id: listingId },
              },
            },
          }],
          expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_MINUTES * 60,
          success_url: `${origin}/app/stores/checkout-complete?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: tokenId
            ? `${origin}/app/post/${encodeURIComponent(tokenId)}`
            : `${origin}/app/stores`,
          // Everything the webhook needs to find its way home. The webhook
          // still looks the intent up by id and re-reads the amount from the
          // charge — metadata is a pointer, never an authority on money.
          metadata: {
            intent_id: intent.id,
            listing_id: listingId,
            buyer_address: buyer,
            seller_address: quote.sellerAddress,
            environment: env,
          },
          payment_intent_data: {
            metadata: { intent_id: intent.id, environment: env },
            // The buyer's statement says DeHub, because DeHub is the merchant
            // of record on this charge. Naming the store reduces the "I don't
            // recognise this" disputes that a marketplace lives and dies on.
            statement_descriptor_suffix: quote.title.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 22) || undefined,
          },
        }, { idempotencyKey: `sci_${intent.id}` });
      } catch (err) {
        // Stripe refused: give the unit back rather than leaving it reserved
        // for 40 minutes behind a session that will never exist.
        await supabase.rpc("store_stock_hold_release", { p_hold_ref: holdRef });
        await supabase.from("store_card_intents")
          .update({ status: "failed" }).eq("id", intent.id);
        console.error("[store-checkout] session create failed", err);
        return jsonResponse({ error: "Could not start card checkout" }, 502);
      }

      await supabase
        .from("store_card_intents")
        .update({
          stripe_session_id: session.id,
          payment_intent_id: typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null,
        })
        .eq("id", intent.id);

      return jsonResponse({
        checkoutUrl: session.url,
        sessionId: session.id,
        amountUsd: quote.grossCents / 100,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[store-checkout] error", err);
    return jsonResponse({ error: "Checkout failed" }, 500);
  }
});
