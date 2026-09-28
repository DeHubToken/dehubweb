import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const PACKAGE = "io.dehub.mobile";
const BASE =
  `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/externalTransactions`;

let cachedToken: { token: string; exp: number } | null = null;

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : new Uint8Array(data as ArrayBuffer);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(): Promise<string | null> {
  const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    console.warn("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not set; skipping Play reporting");
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const sa = JSON.parse(raw);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const pem = String(sa.private_key)
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${b64url(sig)}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Google token error ${res.status}: ${JSON.stringify(json)}`);
  }
  cachedToken = { token: json.access_token, exp: now + Number(json.expires_in ?? 3600) };
  return cachedToken.token;
}

/** POST to Google; "already exists" (409 / ALREADY_EXISTS) counts as success. */
async function googlePost(url: string, body: unknown): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return true;
  const text = await res.text();
  if (res.status === 409 || /ALREADY_EXISTS|already exists/i.test(text)) {
    console.log("Play external transaction already reported:", url);
    return true;
  }
  throw new Error(`Google Play ${res.status}: ${text}`);
}

const micros = (cents: number) => String(Math.round(Number(cents || 0) * 10000));

function subscriptionIdOf(invoice: any): string | undefined {
  const s = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
  return typeof s === "string" ? s : s?.id;
}

function invoiceTax(invoice: any): number {
  if (Array.isArray(invoice.total_taxes)) {
    return invoice.total_taxes.reduce((a: number, t: any) => a + Number(t.amount || 0), 0);
  }
  return Number(invoice.tax ?? 0);
}

async function customerCountry(stripe: any, invoice: any): Promise<string | undefined> {
  const direct = invoice.customer_address?.country;
  if (direct) return direct;
  const cid = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!cid) return undefined;
  const c = await stripe.customers.retrieve(cid);
  return c?.address?.country || c?.shipping?.address?.country || undefined;
}

export async function reportInvoiceToPlay(invoice: any, env: StripeEnv) {
  try {
    const subscriptionId = subscriptionIdOf(invoice);
    if (!subscriptionId) return;
    const stripe = createStripeClient(env) as any;
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const playToken = sub.metadata?.play_ext_token;
    if (!playToken) return;
    if (!Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")) {
      console.warn("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not set; skipping Play reporting");
      return;
    }

    const initialId: string | undefined = sub.metadata?.play_initial_ext_txn_id;
    const currency = String(invoice.currency || "usd").toUpperCase();
    const tax = invoiceTax(invoice);
    const preTax = invoice.total_excluding_tax ?? (Number(invoice.total || 0) - tax);
    const paidAt = invoice.status_transitions?.paid_at ?? invoice.created ??
      Math.floor(Date.now() / 1000);
    const country = await customerCountry(stripe, invoice);

    const isInitial = !initialId || initialId === invoice.id;
    const body = {
      originalPreTaxAmount: { priceMicros: micros(preTax), currency },
      originalTaxAmount: { priceMicros: micros(tax), currency },
      transactionTime: new Date(paidAt * 1000).toISOString(),
      userTaxAddress: { regionCode: country || "US" },
      recurringTransaction: isInitial
        ? {
          externalTransactionToken: playToken,
          externalSubscription: { subscriptionType: "RECURRING" },
        }
        : {
          initialExternalTransactionId: initialId,
          externalSubscription: { subscriptionType: "RECURRING" },
        },
    };

    const ok = await googlePost(
      `${BASE}?externalTransactionId=${encodeURIComponent(invoice.id)}`,
      body,
    );
    if (!ok) return;
    console.log("Reported invoice to Google Play:", invoice.id);

    if (!initialId) {
      await stripe.subscriptions.update(subscriptionId, {
        metadata: { play_initial_ext_txn_id: invoice.id },
      });
    }
    // Mark the invoice so refunds know it was reported.
    await stripe.invoices.update(invoice.id, {
      metadata: { ...(invoice.metadata ?? {}), play_ext_reported: "1" },
    }).catch((e: unknown) => console.warn("Could not mark invoice reported:", e));
  } catch (e) {
    console.error("Google Play report failed for invoice", invoice?.id, e);
  }
}

async function invoiceIdForCharge(stripe: any, charge: any): Promise<string | undefined> {
  const direct = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
  if (direct) return direct;
  const pi = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!pi) return undefined;
  const list = await stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: pi },
    limit: 1,
  });
  const inv = list?.data?.[0]?.invoice;
  return typeof inv === "string" ? inv : inv?.id;
}

export async function reportRefundToPlay(charge: any, env: StripeEnv) {
  try {
    const stripe = createStripeClient(env) as any;
    const invoiceId = await invoiceIdForCharge(stripe, charge);
    if (!invoiceId) return;
    const invoice = await stripe.invoices.retrieve(invoiceId);

    let reported = invoice.metadata?.play_ext_reported === "1";
    if (!reported) {
      const subId = subscriptionIdOf(invoice);
      if (!subId) return;
      const sub = await stripe.subscriptions.retrieve(subId);
      reported = !!sub.metadata?.play_ext_token && !!sub.metadata?.play_initial_ext_txn_id;
    }
    if (!reported) return;
    if (!Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")) {
      console.warn("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not set; skipping Play refund report");
      return;
    }

    const refunds = charge.refunds?.data ?? [];
    const latest = refunds[0];
    const refundTime = new Date(
      ((latest?.created as number) ?? Math.floor(Date.now() / 1000)) * 1000,
    ).toISOString();
    const isFull = Number(charge.amount_refunded) >= Number(charge.amount);
    const currency = String(charge.currency || "usd").toUpperCase();

    // Pre-tax share of this refund, proportional to the invoice's tax split.
    const total = Number(invoice.total || 0);
    const tax = invoiceTax(invoice);
    const refundAmount = Number(latest?.amount ?? charge.amount_refunded ?? 0);
    const preTaxRefund = total > 0 ? Math.round(refundAmount * (total - tax) / total) : refundAmount;

    const body = isFull
      ? { refundTime, fullRefund: {} }
      : {
        refundTime,
        partialRefund: {
          refundPreTaxAmount: { priceMicros: micros(preTaxRefund), currency },
          refundId: latest?.id ?? `${charge.id}-${charge.amount_refunded}`,
        },
      };

    await googlePost(
      `${BASE}/${encodeURIComponent(invoiceId)}:refundExternalTransaction`,
      body,
    );
    console.log("Reported refund to Google Play:", invoiceId);
  } catch (e) {
    console.error("Google Play refund report failed for charge", charge?.id, e);
  }
}
