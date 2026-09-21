// Passkey-only sign-in — the passkey IS the account.
//
// Every other way into DeHub starts from an identity somebody else vouches
// for: Google, Apple, an email inbox, a phone number, a Telegram id. This one
// starts from nothing but the authenticator in the user's hand. Signing up is
// one fingerprint; signing in is one fingerprint; there is no address, no
// code, no password anywhere in the flow.
//
// WebAuthn gives the server a public key at registration and a signed
// challenge at every sign-in. Verifying that signature is the whole job here,
// and it has to be server-side: the browser-only passkey code in
// src/lib/wallet-core/passkey.ts never checks a challenge, because there it is
// a key-wrapping device and not a login. Here a forged assertion would be a
// forged login.
//
// Once the assertion checks out the session is minted the way telegram-auth
// and verify-phone-otp do it: a fresh one-shot password on the user under
// the service role, spent immediately through an anon-key client, which
// returns a genuine access/refresh pair. The password never reaches the
// client. Users are created with a synthetic mailbox so Supabase has an
// email to key on; nothing is ever sent to it.
//
// Actions (POST, JSON body with `action`):
//   register-options  → PublicKeyCredentialCreationOptions to pass to create()
//   register-verify   → verify the attestation; create the user (or attach to
//                       the signed-in one when a Supabase JWT is presented);
//                       return { session, userId, isNew }
//   login-options     → PublicKeyCredentialRequestOptions for a discoverable
//                       credential (no account known yet)
//   login-verify      → verify the assertion against the stored public key;
//                       return { session, userId }
//
// Relying party id: `dehub.io` for the production and staging hosts and for
// the mobile apps, the bare hostname for preview builds and localhost. A
// passkey only answers for the rp id it was made under, so a credential made
// on staging works on dehub.io and in the app, and one made on a preview host
// does not — which is what you want from a preview host.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@13.1.1";
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  serviceClient,
  callerIp,
  checkRateLimit,
} from "../_shared/auth.ts";

const RP_NAME = "DeHub";
const APEX = "dehub.io";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PER_IP_LIMIT = { limit: 40, windowMs: 10 * 60 * 1000 };

// Android's WebAuthn origin is `android:apk-key-hash:<base64url(sha256 of the
// signing cert)>`. These are the two certificates in
// public/.well-known/assetlinks.json (upload key + Play app-signing key), so a
// build signed with either passes. Keep the two files in step.
const ANDROID_CERT_SHA256_HEX = [
  "60A920BCFC23FFF9DAD0F95F0991F1C7DC1B2F211BD2ACEE8071DC5D1D6C9C59",
  "7973A18F05504FDF460764AC776A4C61A6C73298364E1F55E9D07CCA247B3564",
];

function hexToBase64Url(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const ANDROID_ORIGINS = ANDROID_CERT_SHA256_HEX.map((h) => `android:apk-key-hash:${hexToBase64Url(h)}`);

// Same shape as the phone and Telegram pair: supabase-js only surfaces a body
// on 2xx, so every failure is a 200 carrying { error } rather than a status
// the client would only ever see as "FunctionsHttpError".
function errorResponse(message: string, code?: string): Response {
  return jsonResponse({ error: message, ...(code ? { code } : {}) }, 200);
}

interface Rp {
  rpId: string;
  /** Every origin the verifier accepts for this caller. */
  origins: string[];
}

/**
 * Which relying party this request is for, from the browser's Origin header
 * or — for the native apps, whose fetch carries no WebAuthn origin — a
 * `platform` in the body. An Android app cannot cheaply tell which of the two
 * signing certificates it carries, so both apk-key-hash origins are accepted
 * and the verifier checks the response against the list.
 *
 * Returns null for anything else, which turns into a refusal: an origin the
 * verifier would not accept has no business receiving a challenge either.
 */
function resolveRp(req: Request, body: Record<string, unknown>): Rp | null {
  const platform = typeof body.platform === "string" ? body.platform.trim() : "";
  if (platform) {
    if (platform === "android") return { rpId: APEX, origins: ANDROID_ORIGINS };
    // iOS passkeys present the associated web origin.
    if (platform === "ios") return { rpId: APEX, origins: [`https://${APEX}`] };
    return null;
  }

  const raw = req.headers.get("origin") || "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const origin = `${url.protocol}//${url.host}`;

  if (host === APEX || host.endsWith(`.${APEX}`)) {
    if (url.protocol !== "https:") return null;
    return { rpId: APEX, origins: [origin] };
  }
  if (host === "localhost" || host === "127.0.0.1") {
    return { rpId: host, origins: [origin] };
  }
  if (
    url.protocol === "https:" &&
    (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com") || host.endsWith(".lovable.dev"))
  ) {
    return { rpId: host, origins: [origin] };
  }
  return null;
}

function randomBase64Url(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function cleanLabel(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().slice(0, 80) : "";
  return s || null;
}

// deno-lint-ignore no-explicit-any
type Admin = ReturnType<typeof serviceClient>;

/**
 * The signed-in user behind an `Authorization: Bearer <supabase jwt>` header,
 * or null. Used only to ATTACH a new passkey to an existing account; a
 * request with no header (or a bad one) simply registers a fresh account.
 */
async function callerUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

async function storeChallenge(
  admin: Admin,
  row: { challenge: string; purpose: "register" | "login"; rpId: string; userId?: string | null; userHandle?: string | null },
): Promise<boolean> {
  const { error } = await admin.from("passkey_challenges").insert({
    challenge: row.challenge,
    purpose: row.purpose,
    rp_id: row.rpId,
    user_id: row.userId ?? null,
    user_handle: row.userHandle ?? null,
    expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  });
  if (error) console.error("passkey-auth: challenge insert failed", error);
  // Opportunistic sweep; a failure here is not the caller's problem.
  admin.from("passkey_challenges").delete().lt("expires_at", new Date().toISOString()).then(() => {}, () => {});
  return !error;
}

/**
 * Consume a challenge: it must exist, be for this purpose and rp, and be
 * unexpired. Deleting it in the same statement is what makes it single-use.
 */
async function takeChallenge(
  admin: Admin,
  challenge: string,
  purpose: "register" | "login",
  rpId: string,
): Promise<{ userId: string | null; userHandle: string | null } | null> {
  const { data, error } = await admin
    .from("passkey_challenges")
    .delete()
    .eq("challenge", challenge)
    .eq("purpose", purpose)
    .eq("rp_id", rpId)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, user_handle")
    .maybeSingle();
  if (error) {
    console.error("passkey-auth: challenge take failed", error);
    return null;
  }
  if (!data) return null;
  return { userId: data.user_id ?? null, userHandle: data.user_handle ?? null };
}

/** The challenge the client signed, read back out of clientDataJSON. */
function challengeFromResponse(response: unknown): string | null {
  try {
    const cdj = (response as { response?: { clientDataJSON?: string } })?.response?.clientDataJSON;
    if (typeof cdj !== "string") return null;
    const json = JSON.parse(new TextDecoder().decode(base64UrlToBytes(cdj)));
    return typeof json?.challenge === "string" ? json.challenge : null;
  } catch {
    return null;
  }
}

/**
 * Mint a real session for `userId`. See the file header for why this goes
 * through a one-shot password rather than an admin "sign in as" call.
 */
async function mintSession(admin: Admin, userId: string) {
  const { data: got, error: getError } = await admin.auth.admin.getUserById(userId);
  const email = got?.user?.email;
  if (getError || !email) {
    console.error("passkey-auth: getUserById failed", getError);
    return null;
  }
  // Plain randomUUID() is lowercase hex only, which a password policy asking
  // for mixed case or a symbol rejects — silently, as a generic admin-API
  // error. The prefix satisfies any policy this project could have.
  const oneShotPassword = "Aa1!" + crypto.randomUUID();
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: oneShotPassword });
  if (updateError) {
    console.error("passkey-auth: updateUserById failed", updateError);
    return null;
  }
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: oneShotPassword });
  if (error || !data?.session) {
    console.error("passkey-auth: signInWithPassword failed", error);
    return null;
  }
  return data.session;
}

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return errorResponse("Method not allowed");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object") throw new Error("bad");
  } catch {
    return errorResponse("Invalid request body");
  }

  const action = typeof body.action === "string" ? body.action : "";
  const rp = resolveRp(req, body);
  if (!rp) return errorResponse("Passkey sign-in is not available from this site.", "BAD_ORIGIN");

  const admin = serviceClient();
  const ipLimit = await checkRateLimit(admin, `ip:${callerIp(req)}`, "passkey-auth", PER_IP_LIMIT);
  if (!ipLimit.allowed) return errorResponse("Too many attempts. Please try again later.");

  try {
    switch (action) {
      // ── Sign up (or add a passkey to the signed-in account) ─────────────
      case "register-options": {
        // Attaching to the signed-in account is opt-in. supabase-js sends the
        // live session's JWT on every invoke, and the login sheet is reachable
        // while signed in ("Add a profile") — a sign-up there must create a
        // new account, not bolt a passkey onto the current one.
        const attachTo = body.attach === true ? await callerUserId(req) : null;
        // A random handle: WebAuthn wants a stable per-account id here and
        // says it must not be personal data. It is stored with the credential
        // and never shown.
        const userHandle = randomBase64Url(32);
        const label = cleanLabel(body.deviceLabel) ?? "DeHub";

        // Existing credentials on this account, so a second registration on
        // the same authenticator replaces rather than duplicates.
        let exclude: { id: string; transports?: string[] }[] = [];
        if (attachTo) {
          const { data } = await admin
            .from("passkey_identities")
            .select("credential_id, transports")
            .eq("user_id", attachTo);
          exclude = (data ?? []).map((r) => ({
            id: r.credential_id,
            transports: (r.transports ?? undefined) as string[] | undefined,
          }));
        }

        const options = await generateRegistrationOptions({
          rpName: RP_NAME,
          rpID: rp.rpId,
          userID: base64UrlToBytes(userHandle),
          userName: `DeHub · ${label}`,
          userDisplayName: "DeHub",
          attestationType: "none",
          // deno-lint-ignore no-explicit-any
          excludeCredentials: exclude as any,
          authenticatorSelection: {
            residentKey: "required",
            requireResidentKey: true,
            userVerification: "required",
          },
          supportedAlgorithmIDs: [-7, -257],
          timeout: 60_000,
        });

        if (!(await storeChallenge(admin, { challenge: options.challenge, purpose: "register", rpId: rp.rpId, userId: attachTo, userHandle }))) {
          return errorResponse("Could not start passkey setup. Please try again.");
        }
        return jsonResponse({ options, rpId: rp.rpId });
      }

      case "register-verify": {
        const response = body.response;
        const challenge = challengeFromResponse(response);
        if (!challenge) return errorResponse("Invalid passkey response");

        const ticket = await takeChallenge(admin, challenge, "register", rp.rpId);
        if (!ticket) return errorResponse("This passkey setup has expired. Please try again.", "CHALLENGE_EXPIRED");

        let verification;
        try {
          verification = await verifyRegistrationResponse({
            // deno-lint-ignore no-explicit-any
            response: response as any,
            expectedChallenge: challenge,
            expectedOrigin: rp.origins,
            expectedRPID: rp.rpId,
            requireUserVerification: true,
          });
        } catch (err) {
          console.log("passkey-auth: registration rejected", { message: (err as Error)?.message });
          return errorResponse("Could not verify this passkey. Please try again.");
        }
        if (!verification.verified || !verification.registrationInfo) {
          return errorResponse("Could not verify this passkey. Please try again.");
        }
        const info = verification.registrationInfo;
        const credentialId = info.credential.id;

        // The same physical credential cannot be two accounts.
        const { data: clash } = await admin
          .from("passkey_identities")
          .select("user_id")
          .eq("credential_id", credentialId)
          .maybeSingle();
        if (clash) {
          return errorResponse("This passkey is already used to sign in. Use Sign in instead.", "ALREADY_REGISTERED");
        }

        // If the options were issued to a signed-in caller, the credential is
        // attached to that account; the JWT is re-checked here rather than
        // trusted from the options step, so a stolen options ticket cannot
        // attach a stranger's passkey to somebody's account.
        let userId = ticket.userId;
        let isNew = false;
        if (userId) {
          const caller = await callerUserId(req);
          if (caller !== userId) return errorResponse("Sign in again, then add this passkey.", "NOT_SIGNED_IN");
        } else {
          const syntheticEmail = "pk-" + crypto.randomUUID() + "@passkey.dehub.internal";
          const { data: created, error: createError } = await admin.auth.admin.createUser({
            email: syntheticEmail,
            email_confirm: true,
            password: "Aa1!" + crypto.randomUUID(),
            user_metadata: { provider: "passkey" },
          });
          if (createError || !created?.user?.id) {
            console.error("passkey-auth: createUser failed", createError);
            return errorResponse("Sign-up failed. Please try again.");
          }
          userId = created.user.id;
          isNew = true;
        }

        const { error: insertError } = await admin.from("passkey_identities").insert({
          user_id: userId,
          credential_id: credentialId,
          public_key: bytesToBase64Url(info.credential.publicKey),
          counter: info.credential.counter,
          user_handle: ticket.userHandle ?? randomBase64Url(32),
          rp_id: rp.rpId,
          transports: info.credential.transports ?? null,
          backed_up: info.credentialBackedUp,
          aaguid: info.aaguid || null,
          device_label: cleanLabel(body.deviceLabel),
          last_used_at: new Date().toISOString(),
        });
        if (insertError) {
          console.error("passkey-auth: identity insert failed", insertError);
          // A brand-new user with no credential is an orphan nobody can ever
          // reach; remove it rather than leave it behind.
          if (isNew) await admin.auth.admin.deleteUser(userId).catch(() => {});
          return errorResponse("Sign-up failed. Please try again.");
        }

        const session = await mintSession(admin, userId);
        if (!session) return errorResponse("Sign-up failed. Please try again.");

        console.log("passkey-auth: registered", { rpId: rp.rpId, isNew, backedUp: info.credentialBackedUp });
        return new Response(JSON.stringify({ session, userId, isNew, credentialId }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Sign in ─────────────────────────────────────────────────────────
      case "login-options": {
        const options = await generateAuthenticationOptions({
          rpID: rp.rpId,
          userVerification: "required",
          timeout: 60_000,
          // No allowCredentials: the account is not known yet. The
          // authenticator offers whichever discoverable dehub.io passkeys
          // it holds.
        });
        if (!(await storeChallenge(admin, { challenge: options.challenge, purpose: "login", rpId: rp.rpId }))) {
          return errorResponse("Could not start sign-in. Please try again.");
        }
        return jsonResponse({ options, rpId: rp.rpId });
      }

      case "login-verify": {
        const response = body.response as { id?: string; rawId?: string } | undefined;
        const challenge = challengeFromResponse(response);
        const credentialId = typeof response?.id === "string" ? response.id : "";
        if (!challenge || !credentialId) return errorResponse("Invalid passkey response");

        const ticket = await takeChallenge(admin, challenge, "login", rp.rpId);
        if (!ticket) return errorResponse("This sign-in has expired. Please try again.", "CHALLENGE_EXPIRED");

        const { data: cred, error: credError } = await admin
          .from("passkey_identities")
          .select("user_id, public_key, counter, transports")
          .eq("credential_id", credentialId)
          .maybeSingle();
        if (credError) {
          console.error("passkey-auth: identity lookup failed", credError);
          return errorResponse("Sign-in failed. Please try again.");
        }
        if (!cred) {
          // The passkey exists on the device but not with us — typically a
          // wallet-unlock passkey made before passkey sign-in existed, or a
          // preview-host credential. The client turns this into "create an
          // account with this fingerprint instead".
          return errorResponse("This passkey isn't linked to a DeHub account yet.", "UNKNOWN_CREDENTIAL");
        }

        let verification;
        try {
          verification = await verifyAuthenticationResponse({
            // deno-lint-ignore no-explicit-any
            response: response as any,
            expectedChallenge: challenge,
            expectedOrigin: rp.origins,
            expectedRPID: rp.rpId,
            requireUserVerification: true,
            credential: {
              id: credentialId,
              publicKey: base64UrlToBytes(cred.public_key),
              counter: Number(cred.counter) || 0,
              transports: (cred.transports ?? undefined) as never,
            },
          });
        } catch (err) {
          console.log("passkey-auth: assertion rejected", { message: (err as Error)?.message });
          return errorResponse("Could not verify this passkey. Please try again.");
        }
        if (!verification.verified) return errorResponse("Could not verify this passkey. Please try again.");

        await admin
          .from("passkey_identities")
          .update({
            counter: verification.authenticationInfo.newCounter,
            backed_up: verification.authenticationInfo.credentialBackedUp,
            last_used_at: new Date().toISOString(),
          })
          .eq("credential_id", credentialId);

        const session = await mintSession(admin, cred.user_id);
        if (!session) return errorResponse("Sign-in failed. Please try again.");

        console.log("passkey-auth: signed in", { rpId: rp.rpId });
        return new Response(JSON.stringify({ session, userId: cred.user_id }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return errorResponse("Unknown action");
    }
  } catch (err) {
    console.error("passkey-auth: unhandled", err);
    return errorResponse("Something went wrong. Please try again.");
  }
});
