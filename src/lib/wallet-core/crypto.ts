// AES-256-GCM authenticated encryption for wallet secrets.
//
// KDFs supported:
//  - argon2id (default for all PASSWORD-protected wallets — memory-hard, GPU-resistant)
//  - hkdf     (for high-entropy key material, i.e. a WebAuthn PRF output — see passkey.ts)
//  - pbkdf2   (legacy; kept so wallets created before the upgrade still decrypt)
//
// On-disk layout: we still store `{ ciphertext, salt, iv, iterations }` in the
// database (unchanged schema). For Argon2id and HKDF wallets, the KDF
// parameters are packed into a small header prefixed to the base64 ciphertext:
//
//     "v2:" + base64url(JSON.stringify({ kdf, ... })) + ":" + base64(cipher)
//
// Legacy PBKDF2 payloads have no prefix and use `payload.iterations` directly.
// `payload.iterations` is set to 0 for Argon2id/HKDF rows so nothing reads it
// as a PBKDF2 count by accident.
//
// Password stretching (Argon2id/PBKDF2) and key-material derivation (HKDF) are
// deliberately separate entry points: a password MUST be stretched, while a
// 32-byte PRF output is already uniformly random and only needs expanding.
// Feeding one to the other's function is a security bug, so each path rejects
// the other's payloads instead of silently guessing.

import { argon2id } from "hash-wasm";

// PBKDF2 legacy default (OWASP 2023 baseline for SHA-256).
const PBKDF2_ITERATIONS_DEFAULT = 600_000;

// Argon2id defaults: above the OWASP 2023 minimum (m=19 MiB, t=2). A wallet
// unlock is infrequent and latency-tolerant, so we spend more to raise the
// offline brute-force cost on a stolen/breached encrypted_seed. Parameters
// are stored per-payload in the v2 header, so this needs no migration —
// existing wallets keep decrypting with whatever params they were created
// with; only NEW wallets get the higher cost.
const ARGON2_MEMORY_KIB = 65_536; // 64 MiB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const V2_PREFIX = "v2:";

const enc = new TextEncoder();
const dec = new TextDecoder();

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

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

interface Argon2Header {
  kdf: "argon2id";
  m: number; // memory KiB
  t: number; // iterations
  p: number; // parallelism
}

interface HkdfHeader {
  kdf: "hkdf";
  h: "SHA-256";
}

type V2Header = Argon2Header | HkdfHeader;

// Domain separation for the HKDF expand step, so the same PRF output used for
// any other purpose can never yield this wrap key.
const HKDF_INFO = "DeHub wallet seed wrap v1";

async function deriveKeyPbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function deriveKeyArgon2id(
  password: string,
  salt: Uint8Array,
  header: Argon2Header,
): Promise<CryptoKey> {
  const raw = await argon2id({
    password,
    salt,
    parallelism: header.p,
    iterations: header.t,
    memorySize: header.m,
    hashLength: 32,
    outputType: "binary",
  });
  return crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function deriveKeyHkdf(
  keyMaterial: Uint8Array,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    keyMaterial as BufferSource,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: enc.encode(HKDF_INFO) as BufferSource,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface EncryptedPayload {
  ciphertext: string; // base64 (may be prefixed with "v2:<header>:")
  salt: string; // base64
  iv: string; // base64
  iterations: number; // legacy PBKDF2 iteration count; 0 for Argon2id/HKDF rows
}

function parseCiphertext(ciphertext: string): { header: V2Header | null; body: string } {
  if (!ciphertext.startsWith(V2_PREFIX)) return { header: null, body: ciphertext };
  const rest = ciphertext.slice(V2_PREFIX.length);
  const idx = rest.indexOf(":");
  if (idx <= 0) throw new Error("Corrupted wallet payload");
  const headerB64 = rest.slice(0, idx);
  const body = rest.slice(idx + 1);
  let parsed: V2Header;
  try {
    parsed = JSON.parse(base64UrlDecode(headerB64)) as V2Header;
  } catch {
    throw new Error("Corrupted wallet payload");
  }
  // A header we can parse but whose KDF we don't implement is a DIFFERENT
  // failure from corruption — most likely a payload written by a newer client.
  // Reporting it as corruption would send the user to a data-loss message for
  // an intact wallet, so keep the two distinguishable.
  if (parsed?.kdf !== "argon2id" && parsed?.kdf !== "hkdf") {
    throw new Error("This wallet was saved by a newer version of DeHub. Please reload and try again.");
  }
  return { header: parsed, body };
}

/** AES-GCM open, shared by every KDF path. */
async function aesDecrypt(key: CryptoKey, iv: Uint8Array, ct: Uint8Array): Promise<string> {
  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return dec.decode(ptBuf);
}

export async function encryptString(
  plaintext: string,
  password: string,
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const header: Argon2Header = {
    kdf: "argon2id",
    m: ARGON2_MEMORY_KIB,
    t: ARGON2_ITERATIONS,
    p: ARGON2_PARALLELISM,
  };
  const key = await deriveKeyArgon2id(password, salt, header);
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plaintext) as BufferSource,
  );
  const cipherB64 = bytesToBase64(new Uint8Array(ctBuf));
  const wrapped = `${V2_PREFIX}${base64UrlEncode(JSON.stringify(header))}:${cipherB64}`;
  return {
    ciphertext: wrapped,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    iterations: 0, // sentinel: KDF params live inside the ciphertext header
  };
}

export async function decryptString(payload: EncryptedPayload, password: string): Promise<string> {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const { header, body } = parseCiphertext(payload.ciphertext);
  const ct = base64ToBytes(body);

  if (header?.kdf === "hkdf") {
    // Passkey-wrapped payload handed to the password path — no password can
    // ever open it, so say so plainly instead of reporting a wrong password.
    throw new Error("This wallet copy is unlocked with biometrics, not a password.");
  }

  // Explicit rather than relying on narrowing: no header at all means a legacy
  // PBKDF2 payload, which reads its iteration count from the row.
  const argonHeader = header?.kdf === "argon2id" ? header : null;
  const key = argonHeader
    ? await deriveKeyArgon2id(password, salt, argonHeader)
    : await deriveKeyPbkdf2(password, salt, payload.iterations || PBKDF2_ITERATIONS_DEFAULT);

  try {
    return await aesDecrypt(key, iv, ct);
  } catch {
    throw new Error("Incorrect password or corrupted data");
  }
}

/**
 * Encrypt under high-entropy key material (a WebAuthn PRF output) rather than
 * a password. No password stretching: the input is already 32 uniformly random
 * bytes, so HKDF-expand is both sufficient and instant — which is the whole
 * point of the biometric unlock path.
 */
export async function encryptStringWithKeyMaterial(
  plaintext: string,
  keyMaterial: Uint8Array,
): Promise<EncryptedPayload> {
  if (keyMaterial.length < 32) {
    throw new Error("Key material too short — refusing to encrypt the wallet seed");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const header: HkdfHeader = { kdf: "hkdf", h: "SHA-256" };
  const key = await deriveKeyHkdf(keyMaterial, salt);
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plaintext) as BufferSource,
  );
  const cipherB64 = bytesToBase64(new Uint8Array(ctBuf));
  return {
    ciphertext: `${V2_PREFIX}${base64UrlEncode(JSON.stringify(header))}:${cipherB64}`,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    iterations: 0,
  };
}

/** Counterpart to encryptStringWithKeyMaterial. */
export async function decryptStringWithKeyMaterial(
  payload: EncryptedPayload,
  keyMaterial: Uint8Array,
): Promise<string> {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const { header, body } = parseCiphertext(payload.ciphertext);
  const ct = base64ToBytes(body);

  if (header?.kdf !== "hkdf") {
    // Password-wrapped payload handed to the biometric path. This would
    // otherwise stretch the PRF bytes as if they were a password and fail with
    // a misleading "incorrect password".
    throw new Error("This wallet copy is unlocked with a password, not biometrics.");
  }

  const key = await deriveKeyHkdf(keyMaterial, salt);
  try {
    return await aesDecrypt(key, iv, ct);
  } catch {
    // Deliberately says nothing about what to do next: only the caller knows
    // whether this wallet even has a password to fall back to.
    throw new Error("This passkey can't unlock this wallet.");
  }
}

/**
 * Re-encrypt an already-decrypted secret with the current default KDF
 * (Argon2id). Used to silently upgrade old PBKDF2 wallets on next unlock.
 */
export async function reEncryptString(plaintext: string, password: string): Promise<EncryptedPayload> {
  return encryptString(plaintext, password);
}

/** True for wallets still using the legacy PBKDF2 KDF. */
export function isLegacyPayload(payload: EncryptedPayload): boolean {
  return !payload.ciphertext.startsWith(V2_PREFIX);
}

export const DEFAULT_PBKDF2_ITERATIONS = PBKDF2_ITERATIONS_DEFAULT;
