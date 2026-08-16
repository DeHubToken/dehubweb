/**
 * Store Payouts
 * =============
 * The seller's side of card money: what they have, how they get set up, and
 * how they take it out.
 *
 *   balance   — pending / available, for the wallet page
 *   onboard   — create (or resume) a Stripe Express account and return a link
 *   dashboard — a login link to the Express dashboard
 *   withdraw  — debit the ledger and transfer to their connected account
 *
 * The balance is served here rather than read from the table directly because
 * `get_request_wallet_address()` resolves the caller from an unsigned header.
 * A SELECT policy keyed on it would let anyone read anyone's earnings by
 * setting a header. Under requireDeHubAuth the wallet comes off a verified
 * DeHub token instead — the same doctrine ai_credits uses for its balance.
 */

import {
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from "../_shared/auth.ts";
import { createMarketplaceStripeClient, type StripeEnv } from "../_shared/stripe.ts";

/** Stripe transfers below this are not worth the operational noise. */
const MIN_WITHDRAWAL_CENTS = 1000;

function stripeEnv(): StripeEnv {
  return Deno.env.get("STRIPE_MARKETPLACE_MODE") === "sandbox" ? "sandbox" : "live";
}

function siteOrigin(): string {
  return (Deno.env.get("PUBLIC_SITE_URL") || "https://dehub.io").replace(/\/$/, "");
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet;

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
    const { data: account } = await supabase
      .from("seller_payout_accounts")
      .select("*")
      .eq("wallet_address", wallet)
      .eq("environment", env)
      .maybeSingle();

    // ── balance ───────────────────────────────────────────────────────────
    if (action === "balance") {
      const { data, error } = await supabase.rpc("seller_ledger_balance", {
        p_environment: env,
        p_wallet: wallet,
      });
      if (error) throw error;

      const b = (data ?? {}) as Record<string, number | string | null>;
      const pendingCents = Number(b.pending_cents ?? 0);
      const availableCents = Number(b.available_cents ?? 0);
      const lifetimeEarned = Number(b.lifetime_earned_cents ?? 0);

      return jsonResponse({
        pendingCents,
        availableCents,
        pendingUsd: pendingCents / 100,
        availableUsd: availableCents / 100,
        lifetimeEarnedUsd: lifetimeEarned / 100,
        lifetimeWithdrawnUsd: Number(b.lifetime_withdrawn_cents ?? 0) / 100,
        nextReleaseAt: b.next_release_at ?? null,
        minWithdrawalUsd: MIN_WITHDRAWAL_CENTS / 100,
        payoutsEnabled: !!account?.payouts_enabled,
        onboardingStarted: !!account,
        requirementsDue: account?.requirements_due ?? null,
        // Drives whether the wallet renders the card at all. A wallet that has
        // never sold anything should not carry a store-earnings widget.
        hasActivity: lifetimeEarned !== 0 || pendingCents !== 0 || availableCents !== 0 || !!account,
        holdDays: 30,
      });
    }

    // ── onboard ───────────────────────────────────────────────────────────
    if (action === "onboard") {
      const stripe = createMarketplaceStripeClient(env);
      let accountId = account?.stripe_account_id ?? null;

      if (!accountId) {
        // Claim the row FIRST. Two concurrent onboard calls must not create two
        // Express accounts — Stripe idempotency keys expire after 24h and are
        // not a durable guard; this primary key is.
        const placeholder = `pending_${wallet}`;
        const { error: claimErr } = await supabase
          .from("seller_payout_accounts")
          .insert({
            wallet_address: wallet,
            environment: env,
            stripe_account_id: placeholder,
          });

        if (claimErr) {
          // Someone else claimed it between our read and our insert.
          const { data: raced } = await supabase
            .from("seller_payout_accounts")
            .select("stripe_account_id")
            .eq("wallet_address", wallet)
            .eq("environment", env)
            .maybeSingle();
          accountId = raced?.stripe_account_id ?? null;
          if (!accountId || accountId.startsWith("pending_")) {
            return jsonResponse({ error: "Setup already in progress — try again in a moment" }, 409);
          }
        } else {
          const created = await stripe.accounts.create({
            type: "express",
            metadata: { wallet_address: wallet },
            capabilities: { transfers: { requested: true } },
            business_type: "individual",
          }, { idempotencyKey: `acct_${env}_${wallet}` });

          accountId = created.id;
          await supabase
            .from("seller_payout_accounts")
            .update({ stripe_account_id: accountId, country: created.country ?? null })
            .eq("wallet_address", wallet)
            .eq("environment", env);
        }
      }

      if (!accountId || accountId.startsWith("pending_")) {
        return jsonResponse({ error: "Setup already in progress — try again in a moment" }, 409);
      }

      const link = await stripe.accountLinks.create({
        account: accountId,
        type: "account_onboarding",
        refresh_url: `${siteOrigin()}/app/stores?payouts=refresh`,
        return_url: `${siteOrigin()}/app/stores?payouts=done`,
      });

      return jsonResponse({ url: link.url });
    }

    // ── dashboard ─────────────────────────────────────────────────────────
    if (action === "dashboard") {
      if (!account?.stripe_account_id || account.stripe_account_id.startsWith("pending_")) {
        return jsonResponse({ error: "No payout account yet" }, 404);
      }
      const stripe = createMarketplaceStripeClient(env);
      const link = await stripe.accounts.createLoginLink(account.stripe_account_id);
      return jsonResponse({ url: link.url });
    }

    // ── withdraw ──────────────────────────────────────────────────────────
    if (action === "withdraw") {
      if (!account?.payouts_enabled || !account.stripe_account_id) {
        return jsonResponse({ error: "Finish payout setup first" }, 400);
      }

      const requestedCents = Math.floor(Number(body.amountCents ?? 0));
      if (!Number.isFinite(requestedCents) || requestedCents < MIN_WITHDRAWAL_CENTS) {
        return jsonResponse(
          { error: `Minimum withdrawal is $${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2)}` },
          400,
        );
      }

      // One ref for the whole operation: the ledger debit, the payout row and
      // the Stripe idempotency key all key off it, so a retried request cannot
      // debit twice or transfer twice.
      const ref = `wd_${wallet}_${Date.now()}`;

      // Debit first. The ledger is the authority on what the seller is owed; a
      // transfer-then-debit order would pay out twice if the debit then failed.
      const { error: debitErr } = await supabase.rpc("seller_ledger_withdraw", {
        p_environment: env,
        p_wallet: wallet,
        p_cents: requestedCents,
        p_ref: ref,
      });
      if (debitErr) {
        const msg = String(debitErr.message || "");
        if (msg.includes("INSUFFICIENT_BALANCE")) {
          return jsonResponse({ error: "That is more than your available balance" }, 409);
        }
        if (msg.includes("BELOW_MINIMUM")) {
          return jsonResponse({ error: "Below the minimum withdrawal" }, 400);
        }
        throw debitErr;
      }

      await supabase.from("seller_payouts").insert({
        environment: env,
        wallet_address: wallet,
        ledger_ref: ref,
        amount_cents: requestedCents,
        stripe_account_id: account.stripe_account_id,
      });

      try {
        const stripe = createMarketplaceStripeClient(env);
        const transfer = await stripe.transfers.create({
          amount: requestedCents,
          currency: "usd",
          destination: account.stripe_account_id,
          metadata: { ledger_ref: ref, wallet_address: wallet },
        }, { idempotencyKey: ref });

        await supabase.from("seller_payouts")
          .update({ status: "sent", stripe_transfer_id: transfer.id })
          .eq("environment", env).eq("ledger_ref", ref);

        if (!account.first_payout_at) {
          await supabase.from("seller_payout_accounts")
            .update({ first_payout_at: new Date().toISOString() })
            .eq("wallet_address", wallet).eq("environment", env);
        }

        return jsonResponse({ success: true, transferId: transfer.id, amountUsd: requestedCents / 100 });
      } catch (err) {
        // The transfer failed after the debit landed. Compensate, or the seller
        // is short money they still own. This is why the ledger has no
        // non-negative CHECK — the reversal has to be recordable unconditionally.
        await supabase.rpc("seller_ledger_post", {
          p_environment: env,
          p_wallet: wallet,
          p_cents: requestedCents,
          p_reason: "withdrawal_reversal",
          p_ref: `rev_${ref}`,
          p_available_at: null,
          p_order_id: null,
          p_metadata: { failed_ref: ref },
        }).then(() => {}, () => {});

        await supabase.from("seller_payouts")
          .update({ status: "failed", failure_reason: String((err as Error).message).slice(0, 300) })
          .eq("environment", env).eq("ledger_ref", ref);

        console.error("[store-payouts] transfer failed", ref, err);
        return jsonResponse({ error: "The transfer did not go through. Your balance is unchanged." }, 502);
      }
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[store-payouts] error", err);
    return jsonResponse({ error: "Payout request failed" }, 500);
  }
});
