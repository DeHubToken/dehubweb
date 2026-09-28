/**
 * miniapp-auth
 * ============
 * "Sign in with dehub" for mini apps.
 *
 *   GET                         the public JWKS, for developers' servers
 *   POST { domain }             a 1-hour ES256 JWT for the signed-in user,
 *                               audience-bound to that domain
 *
 * The POST is made by the dehub HOST, never by the mini app: the host reads
 * `domain` off the URL it loaded into the frame, so an app on one domain can
 * never obtain a token addressed to another. The app receives the token over
 * the SDK bridge and hands it to its own server, which verifies it against the
 * JWKS with any JOSE library:
 *
 *   jwtVerify(token, createRemoteJWKSet(JWKS_URL), {
 *     issuer: 'https://dehub.io', audience: 'app.example.com',
 *   })
 *
 * `sub` is the user's lowercase wallet address — the same identity every
 * other dehub table keys on.
 *
 * Keys live in public.miniapp_signing_keys (service role only). The first
 * request mints one, so nothing has to be provisioned by hand; two concurrent
 * first requests can mint two, which is harmless because both are published.
 */
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { checkRateLimit, jsonResponse, requireDeHubAuth, serviceClient } from "../_shared/auth.ts";

const ISSUER = "https://dehub.io";
const TTL_SECONDS = 3600;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

interface KeyRow {
  kid: string;
  private_jwk: JsonWebKey;
  public_jwk: JsonWebKey & { kid?: string };
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const enc = new TextEncoder();

async function activeKey(): Promise<KeyRow> {
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

async function sign(claims: Record<string, unknown>, key: KeyRow): Promise<string> {
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

async function jwks(): Promise<Response> {
  const db = serviceClient();
  let { data } = await db
    .from("miniapp_signing_keys")
    .select("public_jwk")
    .is("retired_at", null)
    .order("created_at", { ascending: false });
  if (!data?.length) {
    await activeKey();
    ({ data } = await db.from("miniapp_signing_keys").select("public_jwk").is("retired_at", null));
  }
  return new Response(JSON.stringify({ keys: (data ?? []).map((r) => r.public_jwk) }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600",
    },
  });
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method === "GET") return await jwks();
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const domain = typeof body?.domain === "string" ? body.domain.trim().toLowerCase() : "";
    if (!HOSTNAME.test(domain) && domain !== "localhost") {
      return jsonResponse({ error: "A valid app domain is required." }, 400);
    }
    // dehub's own origins never get a token: nothing on them runs as a mini
    // app, and an audience of dehub.io would read as a dehub session.
    if (domain === "dehub.io" || domain.endsWith(".dehub.io")) {
      return jsonResponse({ error: "That domain cannot receive mini app tokens." }, 400);
    }

    const rl = await checkRateLimit(serviceClient(), auth.wallet, "miniapp-auth", { limit: 120, windowMs: 3600_000 });
    if (!rl.allowed) return jsonResponse({ error: "Too many sign-in requests. Try again shortly." }, 429);

    const now = Math.floor(Date.now() / 1000);
    const key = await activeKey();
    const token = await sign(
      { iss: ISSUER, sub: auth.wallet, aud: domain, iat: now, exp: now + TTL_SECONDS, jti: crypto.randomUUID() },
      key,
    );
    return jsonResponse({ token, expiresAt: (now + TTL_SECONDS) * 1000 });
  } catch (error) {
    console.error("[miniapp-auth]", error);
    return jsonResponse({ error: "Sign-in is temporarily unavailable." }, 500);
  }
});
