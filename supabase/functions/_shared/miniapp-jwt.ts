/**
 * Signing for mini app tokens: "Sign in with dehub" tokens, payment receipts
 * and webhook events. One ES256 key set, kept in public.miniapp_signing_keys
 * (service role only) and published as a JWKS by miniapp-auth; the first use
 * mints a key, so nothing is provisioned by hand.
 */
import { serviceClient } from "./auth.ts";

export const MINIAPP_ISSUER = "https://dehub.io";

export interface KeyRow {
  kid: string;
  private_jwk: JsonWebKey;
  public_jwk: JsonWebKey & { kid?: string };
}

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const enc = new TextEncoder();

export async function activeKey(): Promise<KeyRow> {
  const db = serviceClient();
  const { data } = await db
    .from("miniapp_signing_keys")
    .select("kid, private_jwk, public_jwk")
    .is("retired_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return data as KeyRow;

  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const kid = crypto.randomUUID();
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const publicJwk = { kty, crv, x, y, kid, alg: "ES256", use: "sig" };
  const { error } = await db.from("miniapp_signing_keys").insert({
    kid,
    private_jwk: privateJwk,
    public_jwk: publicJwk,
  });
  if (error) throw new Error(`could not store signing key: ${error.message}`);
  return { kid, private_jwk: privateJwk, public_jwk: publicJwk };
}

export async function sign(claims: Record<string, unknown>, key: KeyRow): Promise<string> {
  const header = { alg: "ES256", typ: "JWT", kid: key.kid };
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    key.private_jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto returns the raw r||s form, which is exactly what JWS wants.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, enc.encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}


/** Sign the claims with the current key; iss, iat, exp and jti are filled in. */
export async function signMiniAppToken(claims: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ iss: MINIAPP_ISSUER, iat: now, exp: now + ttlSeconds, jti: crypto.randomUUID(), ...claims }, await activeKey());
}
