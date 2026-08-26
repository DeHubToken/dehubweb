import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";
import { planGrantDhb } from "../_shared/ai-plans.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _supabase;
}

function resolvePriceId(item: any): string {
  return (
    item?.price?.lookup_key ||
    item?.price?.metadata?.lovable_external_id ||
    item?.price?.id
  );
}

function resolveProductId(item: any): string {
  const product = item?.price?.product;
  return typeof product === "string" ? product : product?.id ?? "";
}

function isoFromUnix(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function handleSubscriptionCreated(subscription: any, env: StripeEnv) {
  const walletAddress = (
    subscription.metadata?.walletAddress ||
    subscription.metadata?.userId ||
    ""
  ).toLowerCase();
  if (!walletAddress) {
    console.error("No wallet in subscription metadata", subscription.id);
    return;
  }
  const item = subscription.items?.data?.[0];
  const periodStart =
    item?.current_period_start ?? subscription.current_period_start;
  const periodEnd =
    item?.current_period_end ?? subscription.current_period_end;

  const priceId = resolvePriceId(item);
  const isActive = ["active", "trialing", "past_due"].includes(subscription.status);

  await getSupabase()
    .from("premium_subscriptions")
    .upsert(
      {
        wallet_address: walletAddress,
        stripe_subscription_id: subscription.id,
        stripe_customer_id:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id,
        product_id: resolveProductId(item),
        price_id: priceId,
        status: subscription.status,
        current_period_start: isoFromUnix(periodStart),
        current_period_end: isoFromUnix(periodEnd),
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );

  // First-50-active XL cashback slot
  if (priceId === "dehub_extra_large_monthly" && isActive) {
    const { data: claimed, error } = await getSupabase().rpc(
      "claim_xl_cashback_slot",
      { p_subscription_id: subscription.id, p_xl_price_id: priceId },
    );
    if (error) console.error("claim_xl_cashback_slot error", error);
    else console.log("XL cashback slot claimed:", claimed, subscription.id);
  }
}


async function handleSubscriptionUpdated(subscription: any, env: StripeEnv) {
  const item = subscription.items?.data?.[0];
  const periodStart =
    item?.current_period_start ?? subscription.current_period_start;
  const periodEnd =
    item?.current_period_end ?? subscription.current_period_end;

  await getSupabase()
    .from("premium_subscriptions")
    .update({
      status: subscription.status,
      product_id: resolveProductId(item),
      price_id: resolvePriceId(item),
      current_period_start: isoFromUnix(periodStart),
      current_period_end: isoFromUnix(periodEnd),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  await getSupabase()
    .from("premium_subscriptions")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

/**
 * Ask the backend to deliver this invoice's DHB to the subscriber's wallet.
 *
 * Returns true when the tokens are handled on-chain and this invoice must NOT
 * also be credited to the ledger — granting both would pay the allowance
 * twice, once in tokens and once in credit.
 *
 * The two systems stay in step without a second flag to remember, because the
 * answer comes from whichever side actually owns the decision. The backend
 * says `queued` when it took the job and `already_recorded` when a previous
 * delivery for this invoice exists; both mean the tokens are covered.
 * Anything else — the feature switched off, a missing secret, a non-2xx, an
 * unreachable host — means they are not, and the caller falls back to the
 * ledger. That is the safe direction to fail: a subscriber who paid always
 * ends up with a usable allowance.
 */
async function deliverPlanTokens(args: {
  wallet: string;
  dhb: number;
  invoiceId: string;
  priceId: string;
  seats: number;
  env: StripeEnv;
}): Promise<boolean> {
  // Test-mode invoices settle in ledger credit, never in tokens. There is no
  // testnet DHB behind this path — the backend sends on Base mainnet — so a
  // sandbox subscription that reached it would pay out real money against a
  // card that was never charged.
  if (args.env !== "live") return false;

  const secret = Deno.env.get("INTERNAL_SERVICE_SECRET");
  if (!secret) return false;

  const base = Deno.env.get("DEHUB_API_URL") ?? "https://api.dehub.io";

  try {
    const res = await fetch(`${base}/api/dpay/subscription-grant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({
        invoiceId: args.invoiceId,
        walletAddress: args.wallet,
        amountDhb: args.dhb,
        priceId: args.priceId,
        seats: args.seats,
      }),
    });

    if (!res.ok) {
      console.error(
        `Token delivery declined for ${args.invoiceId}: HTTP ${res.status}. Falling back to ledger credit.`,
      );
      return false;
    }

    const body = await res.json().catch(() => ({}));
    const handled = body?.queued === true || body?.reason === "already_recorded";
    if (!handled) {
      console.log(
        `Token delivery not taken for ${args.invoiceId} (${body?.reason ?? "unknown"}); using ledger credit.`,
      );
    }
    return handled;
  } catch (e) {
    console.error(
      `Token delivery unreachable for ${args.invoiceId}: ${e}. Falling back to ledger credit.`,
    );
    return false;
  }
}

/**
 * Grant the plan's monthly DHB allowance.
 *
 * Hung off invoice.paid rather than subscription.created so renewals grant too
 * — an allowance that only ever landed once would be a one-off, not a plan.
 * The invoice id is the idempotency key, so Stripe re-delivering a webhook (it
 * does) cannot pay the allowance twice.
 *
 * The allowance is settled one of two ways: as real DHB sent to the
 * subscriber's wallet, or as ledger credit. Never both — see
 * deliverPlanTokens.
 */
async function handleInvoicePaid(invoice: any, env: StripeEnv) {
  const line = invoice.lines?.data?.[0];
  const priceId = resolvePriceId(line);
  const seats = Number(line?.quantity ?? 1);
  const grantDhb = planGrantDhb(priceId, seats);

  if (!grantDhb) {
    console.log("No AI allowance for price:", priceId);
    return;
  }

  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;

  let wallet: string | undefined =
    invoice.subscription_details?.metadata?.walletAddress ||
    invoice.metadata?.walletAddress;

  // Renewal invoices often carry no metadata, so fall back to the row the
  // subscription handlers already wrote.
  if (!wallet && subscriptionId) {
    const { data } = await getSupabase()
      .from("premium_subscriptions")
      .select("wallet_address")
      .eq("stripe_subscription_id", subscriptionId)
      .eq("environment", env)
      .maybeSingle();
    wallet = data?.wallet_address as string | undefined;
  }

  if (!wallet) {
    console.error("No wallet for paid invoice", invoice.id);
    return;
  }

  // On-chain delivery first. It owns the decision about whether this invoice
  // is settled in tokens, and only says no in the cases where ledger credit
  // is the right answer.
  const deliveredAsTokens = await deliverPlanTokens({
    wallet: wallet.toLowerCase(),
    dhb: grantDhb,
    invoiceId: invoice.id,
    priceId,
    seats,
    env,
  });
  if (deliveredAsTokens) {
    console.log(
      `Queued ${grantDhb} DHB on-chain to ${wallet} for ${priceId} (${invoice.id})`,
    );
    return;
  }

  const { error } = await getSupabase().rpc("ai_credit_grant", {
    p_wallet: wallet.toLowerCase(),
    p_dhb: grantDhb,
    p_reason: "plan_grant",
    p_ref: invoice.id,
    p_metadata: { priceId, seats, subscriptionId, environment: env },
  });

  if (error) {
    if (String(error.message || "").includes("CREDIT_ALREADY_APPLIED")) {
      console.log("Allowance already granted for invoice", invoice.id);
      return;
    }
    console.error("Failed to grant AI allowance:", error);
    return;
  }

  console.log(`Granted ${grantDhb} DHB to ${wallet} for ${priceId} (${invoice.id})`);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "customer.subscription.created":
      await handleSubscriptionCreated(event.data.object, env);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    console.error("Webhook bad env:", rawEnv);
    return new Response(
      JSON.stringify({ received: true, ignored: "invalid env" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  try {
    await handleWebhook(req, rawEnv as StripeEnv);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
