/**
 * Biometric wallet unlock via WebAuthn PRF.
 * =========================================
 *
 * WHAT THIS IS NOT: an authentication factor. Identity still comes entirely
 * from Supabase Auth (email OTP / OAuth). Nothing here is verified server-side
 * and no challenge is checked, so a forged assertion would buy an attacker
 * nothing — they'd still need the PRF output, which only the authenticator can
 * produce.
 *
 * WHAT IT IS: a key-wrapping device. The `prf` extension evaluates an HMAC
 * inside the authenticator over a per-credential salt and returns 32 uniformly
 * random bytes — but only after user verification (Face ID / Touch ID /
 * Android biometric / device PIN). Those bytes key an AES-GCM wrap of the same
 * wallet seed the password wrap protects (see crypto.ts's `hkdf` KDF), so a
 * biometric gesture replaces typing the wallet password.
 *
 * Properties worth keeping in mind when changing this file:
 *  - The PRF output is DETERMINISTIC for a given (credential, salt) pair, which
 *    is what lets the same passkey re-derive the wrap key on every unlock.
 *  - For synced credentials (iCloud Keychain, Google Password Manager) it is
 *    also stable across the user's devices. We never rely on that: every
 *    enrolment stores its own wrap row, so a credential that turns out not to
 *    sync simply doesn't unlock elsewhere instead of corrupting anything.
 *  - The bytes never leave the device and are never persisted. Callers wrap or
 *    unwrap immediately and drop the reference.
 *
 * Support is uneven (notably: no PRF in Firefox on Android, and iOS/iPadOS
 * needs 18.4+), so every entry point here is failable by design and the
 * password path always remains available as the fallback.
 */

const PRF_SALT_BYTES = 32;
const WEBAUTHN_TIMEOUT_MS = 60_000;

/** The authenticator can't do PRF — caller should fall back to the password. */
export class PasskeyUnsupportedError extends Error {
  constructor(message = "This device can't use biometrics to unlock your wallet.") {
    super(message);
    this.name = "PasskeyUnsupportedError";
  }
}

/** User dismissed the biometric sheet (or it timed out). Not an error state. */
export class PasskeyCancelledError extends Error {
  constructor(message = "Biometric prompt cancelled.") {
    super(message);
    this.name = "PasskeyCancelledError";
  }
}

// ── Byte helpers ────────────────────────────────────────────────────────────

function bufToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// ── PRF extension typing ────────────────────────────────────────────────────
// lib.dom doesn't model the `prf` extension yet, so describe just the shape we
// use rather than casting to `any` at every call site.

interface PrfValues {
  first: BufferSource;
  second?: BufferSource;
}
interface PrfExtensionInput {
  eval?: PrfValues;
  evalByCredential?: Record<string, PrfValues>;
}
interface PrfExtensionOutput {
  enabled?: boolean;
  results?: { first?: ArrayBuffer; second?: ArrayBuffer };
}

function readPrfOutput(cred: PublicKeyCredential): PrfExtensionOutput | undefined {
  const results = cred.getClientExtensionResults() as
    Record<string, unknown> & { prf?: PrfExtensionOutput };
  return results?.prf;
}

function firstPrfBytes(prf: PrfExtensionOutput | undefined): Uint8Array | null {
  const first = prf?.results?.first;
  if (!first) return null;
  const bytes = new Uint8Array(first);
  // A short or empty result means the authenticator didn't really evaluate the
  // PRF. Wrapping a seed under it would produce a key we can't reproduce.
  return bytes.length >= 32 ? bytes : null;
}

/** Map a WebAuthn DOMException onto our two meaningful outcomes. */
function classifyWebAuthnError(err: unknown): Error {
  const name = (err as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "AbortError") return new PasskeyCancelledError();
  if (name === "NotSupportedError" || name === "SecurityError" || name === "InvalidStateError") {
    return new PasskeyUnsupportedError();
  }
  return err instanceof Error ? err : new Error("Biometric unlock failed");
}

// ── Capability ──────────────────────────────────────────────────────────────

/**
 * Can this browser plausibly offer a biometric wallet unlock?
 *
 * Whether the credential really supports PRF is only knowable by asking the
 * authenticator, so this is a pre-filter for deciding what UI to show: it
 * checks for WebAuthn plus a user-verifying PLATFORM authenticator (the Face
 * ID / Touch ID / Windows Hello / Android biometric case). Enrolment verifies
 * PRF for real and throws PasskeyUnsupportedError if the answer is no.
 */
export async function isBiometricUnlockAvailable(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    if (!window.PublicKeyCredential || !navigator.credentials?.create) return false;
    // Non-secure contexts have no WebAuthn at all (localhost counts as secure).
    if (!window.isSecureContext) return false;
    const fn = window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof fn !== "function") return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Best-effort human label so a user can tell their enrolled devices apart. */
export function describeThisDevice(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android device";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux device";
  return "This device";
}

// ── Enrolment ───────────────────────────────────────────────────────────────

export interface PasskeyEnrollment {
  /** base64url of the raw credential id — the DB key for this wrap. */
  credentialId: string;
  /** base64 of the PRF eval input. Not secret; needed to re-derive the key. */
  prfSalt: string;
  /** 32+ bytes. Wrap the seed with this, then drop the reference. */
  keyMaterial: Uint8Array;
  /** Suggested display label. */
  label: string;
}

/**
 * Create a platform passkey and obtain its PRF output.
 *
 * Two prompts are possible: the spec allows PRF evaluation during create(),
 * but not every authenticator does it, so we ask at create and fall back to an
 * immediate assertion when the result comes back empty. Enrolment is a
 * one-time cost, and every later unlock is a single prompt either way.
 *
 * `authenticatorAttachment` is deliberately unconstrained so a desktop user can
 * enrol the passkey that lives on their phone (hybrid/QR) — the UI gate is
 * isBiometricUnlockAvailable(), not this call.
 */
export async function enrollWalletPasskey(opts: {
  userId: string;
  /** Shown in the OS passkey sheet and in the user's password manager. */
  accountLabel?: string;
}): Promise<PasskeyEnrollment> {
  if (!window.PublicKeyCredential) throw new PasskeyUnsupportedError();

  const prfSalt = crypto.getRandomValues(new Uint8Array(PRF_SALT_BYTES));
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const accountLabel = opts.accountLabel?.trim() || "DeHub wallet";

  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        rp: { id: window.location.hostname, name: "DeHub" },
        user: {
          // The Supabase user id, so re-enrolling on the same device replaces
          // the previous credential for this account instead of piling up.
          id: new TextEncoder().encode(opts.userId),
          name: accountLabel,
          displayName: accountLabel,
        },
        challenge,
        // ES256 first, RS256 for authenticators that lack it. We never verify
        // signatures, but the parameter list is required.
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          residentKey: "required",
          requireResidentKey: true,
          // The whole point: no biometric/PIN check, no key material.
          userVerification: "required",
        },
        timeout: WEBAUTHN_TIMEOUT_MS,
        extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs & {
          prf: PrfExtensionInput;
        },
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw classifyWebAuthnError(err);
  }

  if (!credential) throw new PasskeyCancelledError();

  const credentialId = bufToBase64Url(credential.rawId);
  const prf = readPrfOutput(credential);

  // An explicit `enabled: false` means this credential will never do PRF. The
  // credential itself still exists on the device — harmless, since we don't
  // record it and nothing can be unlocked with it — but the user must use the
  // password path.
  if (prf?.enabled === false) throw new PasskeyUnsupportedError();

  let keyMaterial = firstPrfBytes(prf);
  if (!keyMaterial) {
    // PRF-on-create unsupported: evaluate it with an assertion instead.
    keyMaterial = await evaluatePrf([{ credentialId, prfSalt: bytesToBase64(prfSalt) }])
      .then((r) => r.keyMaterial)
      .catch((err) => {
        if (err instanceof PasskeyCancelledError) throw err;
        throw new PasskeyUnsupportedError();
      });
  }

  return {
    credentialId,
    prfSalt: bytesToBase64(prfSalt),
    keyMaterial,
    label: describeThisDevice(),
  };
}

// ── Unlock ──────────────────────────────────────────────────────────────────

export interface PasskeyRef {
  credentialId: string; // base64url
  prfSalt: string; // base64
}

export interface PrfEvaluation {
  /** Which of the offered credentials actually responded. */
  credentialId: string;
  keyMaterial: Uint8Array;
}

/**
 * Ask the authenticator to evaluate the PRF for one of `refs`.
 *
 * Each enrolment has its own salt, so when several are offered we use
 * `evalByCredential` (keyed by base64url credential id) and identify the
 * responder from the assertion's rawId — that's how the caller knows which
 * wrap row to open.
 */
export async function evaluatePrf(refs: PasskeyRef[]): Promise<PrfEvaluation> {
  if (!refs.length) throw new PasskeyUnsupportedError("No biometric unlock is set up for this account.");
  if (!window.PublicKeyCredential) throw new PasskeyUnsupportedError();

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const allowCredentials = refs.map((r) => ({
    type: "public-key" as const,
    id: base64UrlToBytes(r.credentialId) as BufferSource,
  }));

  const prfInput: PrfExtensionInput =
    refs.length === 1
      ? { eval: { first: base64ToBytes(refs[0].prfSalt) as BufferSource } }
      : {
          evalByCredential: Object.fromEntries(
            refs.map((r) => [r.credentialId, { first: base64ToBytes(r.prfSalt) as BufferSource }]),
          ),
        };

  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials,
        userVerification: "required",
        timeout: WEBAUTHN_TIMEOUT_MS,
        extensions: { prf: prfInput } as AuthenticationExtensionsClientInputs & {
          prf: PrfExtensionInput;
        },
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw classifyWebAuthnError(err);
  }

  if (!assertion) throw new PasskeyCancelledError();

  const keyMaterial = firstPrfBytes(readPrfOutput(assertion));
  if (!keyMaterial) {
    throw new PasskeyUnsupportedError(
      "This device unlocked the passkey but wouldn't release the wallet key. Use your password instead.",
    );
  }

  const respondedId = bufToBase64Url(assertion.rawId);
  // Fall back to the single offered ref when the id doesn't round-trip
  // byte-identically (padding/encoding differences across platforms).
  const matched = refs.find((r) => r.credentialId === respondedId);
  return {
    credentialId: matched?.credentialId ?? (refs.length === 1 ? refs[0].credentialId : respondedId),
    keyMaterial,
  };
}
