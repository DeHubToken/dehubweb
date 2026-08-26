import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";
import Stripe from "https://esm.sh/stripe@22.0.2";

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

const GATEWAY_STRIPE_BASE = "https://connector-gateway.lovable.dev/stripe";

/**
 * A key Stripe itself issued, rather than a Lovable connection id.
 *
 * Which one we hold decides how we talk to Stripe — see createStripeClient.
 * `sk_` is a standard secret key, `rk_` a restricted one; both authenticate
 * directly against api.stripe.com.
 */
const isNativeStripeKey = (key: string): boolean =>
  key.startsWith("sk_") || key.startsWith("rk_");

/**
 * Resolve the key for this environment, preferring the connection id.
 *
 * The fallback to STRIPE_SECRET_KEY exists because that is the secret the
 * Stripe integration provisions on its own, and it was sitting configured and
 * unread while every checkout died on "STRIPE_LIVE_API_KEY is not configured"
 * — the account had no linkable connector connection to produce the other
 * name, so nothing could have set it. Preferring the connection id keeps
 * existing deployments on exactly the path they are on today.
 */
export function getConnectionApiKey(env: StripeEnv): string {
  const preferred = env === "sandbox"
    ? "STRIPE_SANDBOX_API_KEY"
    : "STRIPE_LIVE_API_KEY";

  const configured = Deno.env.get(preferred);
  if (configured) return configured;

  const fallback = Deno.env.get("STRIPE_SECRET_KEY");
  if (fallback && env === "live") return fallback;

  // Name the key that was actually looked for first — the fallback is a
  // convenience, not the documented setting.
  throw new Error(`${preferred} is not configured`);
}

export function createStripeClient(env: StripeEnv): Stripe {
  const connectionApiKey = getConnectionApiKey(env);

  // A native Stripe key authenticates with Stripe directly, so the gateway
  // has no part to play — it exists to attach a Lovable connection to a
  // request that cannot authenticate on its own. Routing a real key through
  // it would fail on X-Connection-Api-Key, and would put every fiat payment
  // behind a third party that this path does not otherwise need.
  if (isNativeStripeKey(connectionApiKey)) {
    return new Stripe(connectionApiKey, {
      apiVersion: "2026-03-25.dahlia" as any,
    });
  }

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
