// Transak off-ramp: creators sell USDC for a bank payout.
//
// Transak runs KYC, holds the bank details and pays out; we only mint a
// one-time widget session and record the order reference and status.
// Configured by env alone — with no TRANSAK_API_KEY / TRANSAK_API_SECRET the
// feature reports itself disabled and the client keeps the button hidden.

export type TransakEnv = "staging" | "production";

export interface TransakConfig {
  apiKey: string;
  apiSecret: string;
  env: TransakEnv;
  referrerDomain: string;
}

export const CASHOUT_ASSETS = {
  base: { label: "Base", currency: "USDC" },
  bsc: { label: "BNB Chain", currency: "USDC" },
} as const;
export type CashoutNetwork = keyof typeof CASHOUT_ASSETS;

export const MIN_CASHOUT = 1;
export const MAX_CASHOUT = 100_000;

const HOSTS: Record<TransakEnv, { api: string; gateway: string }> = {
  staging: { api: "https://api-stg.transak.com", gateway: "https://api-gateway-stg.transak.com" },
  production: { api: "https://api.transak.com", gateway: "https://api-gateway.transak.com" },
};

export function transakConfig(env: (name: string) => string | undefined): TransakConfig | null {
  const apiKey = env("TRANSAK_API_KEY")?.trim();
  const apiSecret = env("TRANSAK_API_SECRET")?.trim();
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    env: env("TRANSAK_ENV") === "staging" ? "staging" : "production",
    referrerDomain: env("TRANSAK_REFERRER_DOMAIN")?.trim() || "dehub.io",
  };
}

/** Parse and bound a cash-out request. Returns null when anything is off. */
export function parseCashoutRequest(body: unknown): { amount: number; network: CashoutNetwork } | null {
  const row = body as { amount?: unknown; network?: unknown } | null;
  const amount = Number(row?.amount);
  const network = row?.network;
  if (!Number.isFinite(amount) || amount < MIN_CASHOUT || amount > MAX_CASHOUT) return null;
  if (typeof network !== "string" || !Object.hasOwn(CASHOUT_ASSETS, network)) return null;
  return { amount: Math.round(amount * 1e6) / 1e6, network: network as CashoutNetwork };
}

export function sellWidgetParams(cfg: TransakConfig, input: {
  orderId: string; wallet: string; amount: number; network: CashoutNetwork; redirectURL: string;
}) {
  return {
    apiKey: cfg.apiKey,
    referrerDomain: cfg.referrerDomain,
    productsAvailed: "SELL",
    cryptoCurrencyCode: CASHOUT_ASSETS[input.network].currency,
    network: input.network,
    cryptoAmount: input.amount,
    walletAddress: input.wallet,
    partnerOrderId: input.orderId,
    partnerCustomerId: input.wallet,
    redirectURL: input.redirectURL,
    hideMenu: true,
  };
}

/** Collapse partner statuses into the few the UI shows. */
export function cashoutStatus(partnerStatus: unknown): string {
  switch (String(partnerStatus || "").toUpperCase()) {
    case "COMPLETED": return "completed";
    case "FAILED": return "failed";
    case "CANCELLED": return "cancelled";
    case "EXPIRED": return "expired";
    case "REFUNDED": return "refunded";
    case "AWAITING_PAYMENT_FROM_USER": return "awaiting_crypto";
    case "": return "started";
    default: return "processing";
  }
}

const b64urlBytes = (part: string) => {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

/** Verify an HS256 JWT and return its claims, or null. */
export async function verifyHs256(jwt: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = typeof jwt === "string" ? jwt.split(".") : [];
  if (parts.length !== 3 || !secret) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0])));
    if (header?.alg !== "HS256") return null;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "HMAC", key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1])));
    if (typeof claims?.exp === "number" && claims.exp * 1000 < Date.now()) return null;
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

interface TokenStore {
  read(): Promise<{ token: string; expiresAt: number } | null>;
  write(token: string, expiresAt: number): Promise<void>;
}

/**
 * The shared partner access token. Refreshing revokes the previous token, so
 * only refresh when the stored one is missing or close to expiry (or `force`).
 */
export async function partnerAccessToken(cfg: TransakConfig, store: TokenStore, force = false): Promise<string> {
  const current = await store.read();
  if (!force && current && current.expiresAt - Date.now() > 60 * 60 * 1000) return current.token;
  const res = await fetch(`${HOSTS[cfg.env].api}/partners/api/v2/refresh-token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "api-secret": cfg.apiSecret },
    body: JSON.stringify({ apiKey: cfg.apiKey }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  const token = data?.data?.accessToken;
  const expiresAt = Number(data?.data?.expiresAt) * 1000;
  if (!res.ok || typeof token !== "string" || !Number.isFinite(expiresAt)) {
    throw new Error(`Transak token refresh failed (${res.status})`);
  }
  await store.write(token, expiresAt);
  return token;
}

export function isTransakUrl(url: unknown): url is string {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".transak.com");
  } catch {
    return false;
  }
}

export async function createWidgetUrl(cfg: TransakConfig, accessToken: string, widgetParams: object): Promise<string> {
  const res = await fetch(`${HOSTS[cfg.env].gateway}/api/v2/auth/session`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "access-token": accessToken },
    body: JSON.stringify({ widgetParams }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  const url = data?.data?.widgetUrl;
  if (!res.ok || !isTransakUrl(url)) {
    const err = new Error(`Transak session failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return url;
}
