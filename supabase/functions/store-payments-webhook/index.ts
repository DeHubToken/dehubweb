/**
 * Store Payments Webhook
 * ======================
 * Stripe's view of the marketplace, applied to the seller ledger.
 *
 * Separate from `payments-webhook` (premium subscriptions) because it verifies
 * against a different account's signing secret and must never share a failure
 * mode with subscription billing.
 *
 * Three rules this file is built around, each learned from a way this shape
 * goes wrong:
 *
 *  1. **Settlement is ONE database call.** Edge functions reach Postgres over
 *     PostgREST, so `.rpc()` then `.insert()` then `.rpc()` is three separate
 *     transactions and any lock taken in the first is gone by the second. All
 *     the atomicity lives inside `store_card_order_settle`.
 *  2. **The event id is NOT the idempotency gate.** Stripe sends
 *     `checkout.session.completed` AND `payment_intent.succeeded` for one
 *     payment, with different event ids, concurrently. Deduping on event id
 *     lets both through and credits the sale twice. The real guards are the
 *     unique indexes on `(environment, payment_intent_id)` and
 *     `(environment, reason, ref)`, which sit in the same transaction as the
 *     work they protect. The audit table is observability only.
 *  3. **A business problem is never a 500.** An oversell or an amount mismatch
 *     is recorded and refunded; only an infrastructure failure returns non-2xx,
 *     because non-2xx is what makes Stripe retry, and retrying a business
 *     problem retries it forever against an already-charged buyer.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createMarketplaceStripeClient,
  marketplaceWebhookSecret,
  verifyWebhookWithSecret,
  type StripeEnv,
} from "../_shared/stripe.ts";

/** Stripe's standard dispute fee, in cents. Not returned when you win. */
const DISPUTE_FEE_CENTS = 1500;

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function stripeEnv(): StripeEnv {
  return Deno.env.get("STRIPE_MARKETPLACE_MODE") === "sandbox" ? "sandbox" : "live";
}

/** The fee Stripe actually took, from the charge's balance transaction. */
async function readCharge(env: StripeEnv, paymentIntentId: string): Promise<{
  chargedCents: number;
  feeCents: number;
  chargeId: string | null;
} | null> {
  try {
    const stripe = createMarketplaceStripeClient(env);
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge: any = pi.latest_charge;
    if (!charge || typeof charge === "string") {
      return { chargedCents: pi.amount_received ?? pi.amount, feeCents: 0, chargeId: null };
    }
    const bt = charge.balance_transaction;
    return {
      chargedCents: charge.amount_captured ?? charge.amount ?? pi.amount,
      feeCents: bt && typeof bt !== "string" ? (bt.fee ?? 0) : 0,
      chargeId: charge.id ?? null,
    };
  } catch (err) {
    console.error("[store-webhook] readCharge failed", err);
    return null;
  }
}

/** Best-effort automatic refund for a sale we could not honour. */
async function refundOversold(env: StripeEnv, paymentIntentId: string) {
  try {
    const stripe = createMarketplaceStripeClient(env);
    await stripe.refunds.create(
      { payment_intent: paymentIntentId, reason: "requested_by_customer" },
      { idempotencyKey: `oversold_${paymentIntentId}` },
    );
  } catch (err) {
    // Logged, not thrown: the order row already records `oversold` and a human
    // can refund from the dashboard. Throwing would retry the whole settlement.
    console.error("[store-webhook] auto-refund failed", paymentIntentId, err);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const env = stripeEnv();
  const raw = await req.text();

  let event: { id: string; type: string; data: { object: any } };
  try {
    event = await verifyWebhookWithSecret(
      raw,
      req.headers.get("stripe-signature"),
      marketplaceWebhookSecret(env),
    );
  } catch (err) {
    // 400, and nothing written. An unverified body is not evidence of anything.
    console.error("[store-webhook] signature rejected", err);
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  const supabase = serviceClient();
  const obj = event.data.object;
  let outcome = "ignored";

  try {
    switch (event.type) {
      // ── The sale ──────────────────────────────────────────────────────────
      // Both of these arrive for one payment. Both route here; the settle
      // function makes the second one a no-op.
      case "checkout.session.completed":
      case "payment_intent.succeeded": {
        const paymentIntentId: string | null =
          event.type === "checkout.session.completed"
            ? (typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id ?? null)
            : obj.id;

        if (!paymentIntentId) { outcome = "no_payment_intent"; break; }

        // A session can complete before its PaymentIntent id was written back
        // by store-checkout. Backfill by intent id from metadata so the settle
        // lookup cannot miss.
        const intentId = obj.metadata?.intent_id;
        if (intentId) {
          await supabase
            .from("store_card_intents")
            .update({ payment_intent_id: paymentIntentId })
            .eq("id", intentId)
            .is("payment_intent_id", null);
        }

        const charge = await readCharge(env, paymentIntentId);
        if (!charge) {
          // Could not reach Stripe. This IS infrastructure — let it retry.
          return new Response(JSON.stringify({ error: "upstream_unavailable" }), { status: 503 });
        }

        const { data, error } = await supabase.rpc("store_card_order_settle", {
          p_environment: env,
          p_payment_intent_id: paymentIntentId,
          p_charged_cents: charge.chargedCents,
          p_stripe_fee_cents: charge.feeCents,
          p_buyer_email: obj.customer_details?.email ?? null,
          p_metadata: { charge_id: charge.chargeId, event_id: event.id },
        });

        if (error) {
          if (String(error.message || "").includes("INTENT_NOT_FOUND")) {
            // Not ours, or a sandbox event against live data. Do not retry.
            outcome = "intent_not_found";
            break;
          }
          throw error;
        }

        outcome = (data as any)?.status ?? "settled";

        if (String((data as any)?.warning || "").includes("oversold")) {
          await refundOversold(env, paymentIntentId);
          await supabase.rpc("seller_ledger_reverse", {
            p_environment: env,
            p_payment_intent_id: paymentIntentId,
            p_cents: (data as any).net_cents,
            p_reason: "refund",
            p_ref: `oversold_${paymentIntentId}`,
            p_metadata: { auto: true },
          }).then(() => {}, () => {});
          outcome = "settled_oversold_refunded";
        }
        break;
      }

      // ── Abandonment ───────────────────────────────────────────────────────
      case "checkout.session.expired": {
        const intentId = obj.metadata?.intent_id;
        if (!intentId) { outcome = "no_intent"; break; }
        await supabase.rpc("store_stock_hold_release", { p_hold_ref: `sci:${intentId}` });
        await supabase
          .from("store_card_intents")
          .update({ status: "expired" })
          .eq("id", intentId)
          .eq("status", "created");
        outcome = "expired_released";
        break;
      }

      // ── Refunds ───────────────────────────────────────────────────────────
      // charge.refunded fires for partial refunds too, so the amount is read
      // off the refund rather than assumed to be the whole sale.
      case "charge.refunded":
      case "refund.created": {
        const paymentIntentId = typeof obj.payment_intent === "string"
          ? obj.payment_intent
          : obj.payment_intent?.id;
        if (!paymentIntentId) { outcome = "no_payment_intent"; break; }

        const refundedCents = event.type === "refund.created"
          ? obj.amount
          : (obj.amount_refunded ?? 0);
        if (!refundedCents) { outcome = "zero_refund"; break; }

        const { data: intent } = await supabase
          .from("store_card_intents")
          .select("gross_cents, net_cents")
          .eq("environment", env)
          .eq("payment_intent_id", paymentIntentId)
          .maybeSingle();
        if (!intent) { outcome = "intent_not_found"; break; }

        // Debit the seller their share of what was refunded, not the gross —
        // the platform fee is refunded out of the platform's own cut.
        const sellerShare = Math.round(
          (refundedCents / Number(intent.gross_cents)) * Number(intent.net_cents),
        );

        const { error } = await supabase.rpc("seller_ledger_reverse", {
          p_environment: env,
          p_payment_intent_id: paymentIntentId,
          p_cents: sellerShare,
          p_reason: "refund",
          p_ref: obj.id,
          p_metadata: { refunded_cents: refundedCents, event_id: event.id },
        });
        // MOVEMENT_ALREADY_APPLIED is a re-delivery, which is success.
        if (error && !String(error.message || "").includes("ALREADY_APPLIED")) throw error;
        outcome = "refund_applied";
        break;
      }

      // ── Disputes ──────────────────────────────────────────────────────────
      // Only the funds_withdrawn / funds_reinstated statuses move money.
      // `dispute.created` alone does not, and debiting on it double-counts.
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.funds_reinstated": {
        const paymentIntentId = typeof obj.payment_intent === "string"
          ? obj.payment_intent
          : obj.payment_intent?.id;
        if (!paymentIntentId) { outcome = "no_payment_intent"; break; }

        const withdrawn = event.type === "charge.dispute.funds_withdrawn";
        const { data: intent } = await supabase
          .from("store_card_intents")
          .select("gross_cents, net_cents, seller_address")
          .eq("environment", env)
          .eq("payment_intent_id", paymentIntentId)
          .maybeSingle();
        if (!intent) { outcome = "intent_not_found"; break; }

        if (withdrawn) {
          const sellerShare = Math.round(
            ((obj.amount ?? intent.gross_cents) / Number(intent.gross_cents)) * Number(intent.net_cents),
          );
          const { error } = await supabase.rpc("seller_ledger_reverse", {
            p_environment: env,
            p_payment_intent_id: paymentIntentId,
            p_cents: sellerShare,
            p_reason: "dispute",
            p_ref: obj.id,
            p_metadata: { dispute_id: obj.id, event_id: event.id },
          });
          if (error && !String(error.message || "").includes("ALREADY_APPLIED")) throw error;

          // The dispute fee is the platform's cost of the seller's sale, and it
          // is not refunded even when the dispute is won. It has no hold: it is
          // owed now, not in 30 days.
          await supabase.rpc("seller_ledger_post", {
            p_environment: env,
            p_wallet: intent.seller_address,
            p_cents: -DISPUTE_FEE_CENTS,
            p_reason: "dispute_fee",
            p_ref: `fee_${obj.id}`,
            p_available_at: null,
            p_order_id: null,
            p_metadata: { dispute_id: obj.id },
          }).then(() => {}, () => {});
          outcome = "dispute_debited";
        } else {
          const { data: sale } = await supabase
            .from("seller_ledger")
            .select("wallet_address, available_at, order_id, delta_cents")
            .eq("environment", env)
            .eq("reason", "sale")
            .eq("ref", paymentIntentId)
            .maybeSingle();
          if (!sale) { outcome = "sale_not_found"; break; }

          const { error } = await supabase.rpc("seller_ledger_post", {
            p_environment: env,
            p_wallet: sale.wallet_address,
            p_cents: Math.round(obj.amount ?? sale.delta_cents),
            p_reason: "dispute_reversal",
            p_ref: `won_${obj.id}`,
            p_available_at: sale.available_at,
            p_order_id: sale.order_id,
            p_metadata: { dispute_id: obj.id },
          });
          if (error && !String(error.message || "").includes("ALREADY_APPLIED")) throw error;
          outcome = "dispute_reinstated";
        }
        break;
      }

      // ── Connected account state ───────────────────────────────────────────
      case "account.updated": {
        const { error } = await supabase
          .from("seller_payout_accounts")
          .update({
            charges_enabled: !!obj.charges_enabled,
            payouts_enabled: !!obj.payouts_enabled,
            requirements_due: obj.requirements?.currently_due ?? null,
            disabled_reason: obj.requirements?.disabled_reason ?? null,
            country: obj.country ?? null,
            onboarded_at: obj.payouts_enabled ? new Date().toISOString() : null,
          })
          .eq("environment", env)
          .eq("stripe_account_id", obj.id);
        if (error) throw error;
        outcome = "account_updated";
        break;
      }

      // A transfer we made was clawed back by Stripe. Put the money back on the
      // seller's ledger — they no longer have it.
      case "transfer.reversed": {
        const payoutRef = obj.metadata?.ledger_ref;
        if (!payoutRef) { outcome = "no_ledger_ref"; break; }
        const { data: payout } = await supabase
          .from("seller_payouts")
          .select("wallet_address, amount_cents")
          .eq("environment", env)
          .eq("ledger_ref", payoutRef)
          .maybeSingle();
        if (!payout) { outcome = "payout_not_found"; break; }

        await supabase.rpc("seller_ledger_post", {
          p_environment: env,
          p_wallet: payout.wallet_address,
          p_cents: Number(payout.amount_cents),
          p_reason: "withdrawal_reversal",
          p_ref: `rev_${payoutRef}`,
          p_available_at: null,
          p_order_id: null,
          p_metadata: { transfer_id: obj.id },
        }).then(() => {}, () => {});
        await supabase.from("seller_payouts")
          .update({ status: "reversed" })
          .eq("environment", env).eq("ledger_ref", payoutRef);
        outcome = "transfer_reversed";
        break;
      }
    }

    // Audit AFTER the work, never before. A claim-row-first design drops the
    // event permanently when the handler throws on a transient error and the
    // retry then collides with its own claim.
    await supabase.from("stripe_marketplace_events").insert({
      environment: env,
      event_id: event.id,
      event_type: event.type,
      outcome,
      payload: { id: obj?.id, amount: obj?.amount ?? obj?.amount_total ?? null },
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ received: true, outcome }), { status: 200 });
  } catch (err) {
    // Infrastructure only. Stripe retries with backoff, and every guard above
    // is idempotent, so a retry after a partial failure converges.
    console.error("[store-webhook] handler failed", event.type, err);
    return new Response(JSON.stringify({ error: "handler_failed" }), { status: 500 });
  }
});
