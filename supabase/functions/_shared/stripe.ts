import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";
import Stripe from "https://esm.sh/stripe@22.0.2";

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

const GATEWAY_STRIPE_BASE = "https://connector-gateway.lovable.dev/stripe";

export function getConnectionApiKey(env: StripeEnv): string {
  return env === "sandbox"
    ? getEnv("STRIPE_SANDBOX_API_KEY")
    : getEnv("STRIPE_LIVE_API_KEY");
}

export function createStripeClient(env: StripeEnv): Stripe {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");

  return new Stripe(connectionApiKey, {
    apiVersion: "2026-03-25.dahlia" as any,
    httpClient: Stripe.createFetchHttpClient((input, init) => {
      const stripeUrl =
        input instanceof Request ? input.url : input.toString();
      const gatewayUrl = stripeUrl.replace(
        "https://api.stripe.com",
        GATEWAY_STRIPE_BASE,
      );
      return fetch(gatewayUrl, {
        ...init,
        headers: {
          ...Object.fromEntries(
            new Headers(
              init?.headers ??
                (input instanceof Request ? input.headers : undefined),
            ).entries(),
          ),
          "X-Connection-Api-Key": connectionApiKey,
          "Lovable-API-Key": lovableApiKey,
        },
      });
    }),
  });
}

// ── Marketplace (store) Stripe ──────────────────────────────────────────────
// Everything above this line is the premium-subscription path and is unchanged.
//
// The marketplace runs on a DIFFERENT Stripe account and a DIRECT client. Two
// separate reasons, both load-bearing:
//
//  1. No connector-gateway.lovable.dev in the money path. The client above
//     rewrites every api.stripe.com call to that gateway and authenticates with
//     LOVABLE_API_KEY; its sibling AI gateway has already been 402-dead once. A
//     card charge has no next-provider fallback, and a marketplace cannot be
//     down because an unrelated AI balance hit zero.
//  2. A marketplace dispute ratio must not be able to terminate the account
//     that also processes subscriptions. Visa's monitoring programme triggers
//     on the account, so the blast radius is bounded by keeping them apart.

/** Raw sk_/rk_ key on the marketplace account — NOT a Lovable connection handle. */
export function createMarketplaceStripeClient(env: StripeEnv): Stripe {
  const key = env === "sandbox"
    ? getEnv("STRIPE_MARKETPLACE_SANDBOX_KEY")
    : getEnv("STRIPE_MARKETPLACE_LIVE_KEY");

  return new Stripe(key, {
    apiVersion: "2026-03-25.dahlia" as any,
    // Deno's fetch, straight to Stripe. No gateway, no rewrite.
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function marketplaceWebhookSecret(env: StripeEnv): string {
  return env === "sandbox"
    ? getEnv("MARKETPLACE_WEBHOOK_SECRET_SANDBOX")
    : getEnv("MARKETPLACE_WEBHOOK_SECRET_LIVE");
}

/**
 * Verify a webhook against an explicitly supplied secret, returning the event
 * id along with the payload.
 *
 * Separate from verifyWebhook() because that one resolves its secret from the
 * premium env vars and its return type has no `id` — an event id is needed for
 * the audit row, and the caller must be able to say which account's secret to
 * check. Two differences from the original beyond that, both deliberate:
 *
 *  - The tolerance is one-sided. The original uses Math.abs, which accepts a
 *    timestamp 299 seconds in the FUTURE — a replay window against a forged
 *    clock. A real Stripe event is never from the future.
 *  - Comparison is constant-time. Array.includes on a hex string leaks position
 *    through timing; not a practical break here, but there is no reason to hand
 *    it over on the one endpoint that credits money.
 */
export async function verifyWebhookWithSecret(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<{ id: string; type: string; data: { object: any } }> {
  if (!signatureHeader || !rawBody) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }
  if (!timestamp || v1Signatures.length === 0) {
    throw new Error("Invalid signature format");
  }

  const skew = Date.now() / 1000 - Number(timestamp);
  if (skew > 300 || skew < -60) throw new Error("Webhook timestamp out of tolerance");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expected = new TextDecoder().decode(encode(new Uint8Array(signed)));

  let matched = false;
  for (const candidate of v1Signatures) {
    if (candidate.length !== expected.length) continue;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (diff === 0) matched = true;
  }
  if (!matched) throw new Error("Invalid webhook signature");

  return JSON.parse(rawBody);
}

export async function verifyWebhook(
  req: Request,
  env: StripeEnv,
): Promise<{ type: string; data: { object: any } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret =
    env === "sandbox"
      ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
      : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");

  if (!signature || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }

  if (!timestamp || v1Signatures.length === 0) {
    throw new Error("Invalid signature format");
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error("Webhook timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = new TextDecoder().decode(encode(new Uint8Array(signed)));

  if (!v1Signatures.includes(expected)) {
    throw new Error("Invalid webhook signature");
  }

  return JSON.parse(body);
}
