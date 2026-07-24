// AES-256-GCM authenticated encryption for wallet secrets.
//
// KDFs supported:
//  - argon2id (default for all new wallets — memory-hard, GPU-resistant)
//  - pbkdf2   (legacy; kept so wallets created before the upgrade still decrypt)
//
// On-disk layout: we still store `{ ciphertext, salt, iv, iterations }` in the
// database (unchanged schema). For Argon2id wallets, the KDF parameters are
// packed into a small header prefixed to the base64 ciphertext:
//
//     "v2:" + base64url(JSON.stringify({ kdf, m, t, p })) + ":" + base64(cipher)
//
// Legacy PBKDF2 payloads have no prefix and use `payload.iterations` directly.
// `payload.iterations` is set to 0 for Argon2id rows so nothing reads it as a
// PBKDF2 count by accident.

import { argon2id } from "hash-wasm";

// PBKDF2 legacy default (OWASP 2023 baseline for SHA-256).
const PBKDF2_ITERATIONS_DEFAULT = 600_000;

// Argon2id defaults: OWASP 2023 recommended minimum profile.
// m=19 MiB, t=2, p=1 — ~150-300ms on a modern laptop, GPU-hostile.
const ARGON2_MEMORY_KIB = 19_456; // 19 MiB
const ARGON2_ITERATIONS = 2;
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

export interface EncryptedPayload {
  ciphertext: string; // base64 (may be prefixed with "v2:<header>:")
  salt: string; // base64
  iv: string; // base64
  iterations: number; // legacy PBKDF2 iteration count; 0 for Argon2id rows
}

function parseCiphertext(ciphertext: string): { header: Argon2Header | null; body: string } {
  if (!ciphertext.startsWith(V2_PREFIX)) return { header: null, body: ciphertext };
  const rest = ciphertext.slice(V2_PREFIX.length);
  const idx = rest.indexOf(":");
  if (idx <= 0) throw new Error("Corrupted wallet payload");
  const headerB64 = rest.slice(0, idx);
  const body = rest.slice(idx + 1);
  try {
    const parsed = JSON.parse(base64UrlDecode(headerB64)) as Argon2Header;
    if (parsed.kdf !== "argon2id") throw new Error("Unknown KDF");
    return { header: parsed, body };
  } catch {
    throw new Error("Corrupted wallet payload");
  }
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

  const key = header
    ? await deriveKeyArgon2id(password, salt, header)
    : await deriveKeyPbkdf2(password, salt, payload.iterations || PBKDF2_ITERATIONS_DEFAULT);

  try {
    const ptBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
    return dec.decode(ptBuf);
  } catch {
    throw new Error("Incorrect password or corrupted data");
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
