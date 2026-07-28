/**
 * The biometric wrap keys AES-GCM from raw WebAuthn PRF bytes instead of a
 * password. These tests pin the properties that make that safe: it round-trips,
 * it's bound to the exact key material, and the password and key-material
 * paths can never be crossed by accident.
 */
import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import {
  encryptString,
  decryptString,
  encryptStringWithKeyMaterial,
  decryptStringWithKeyMaterial,
  isLegacyPayload,
} from "../crypto";

// jsdom exposes no SubtleCrypto; Node's WebCrypto is API-compatible.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

const SEED = "test test test test test test test test test test test junk";

function keyMaterial(fill: number, length = 32): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

describe("key-material (biometric) wrap", () => {
  it("round-trips the wallet seed", async () => {
    const km = keyMaterial(7);
    const payload = await encryptStringWithKeyMaterial(SEED, km);
    await expect(decryptStringWithKeyMaterial(payload, km)).resolves.toBe(SEED);
  });

  it("marks the payload with the hkdf KDF and no PBKDF2 iteration count", async () => {
    const payload = await encryptStringWithKeyMaterial(SEED, keyMaterial(1));
    expect(payload.ciphertext.startsWith("v2:")).toBe(true);
    expect(payload.iterations).toBe(0);
    expect(isLegacyPayload(payload)).toBe(false);
    const header = JSON.parse(
      Buffer.from(payload.ciphertext.split(":")[1], "base64url").toString(),
    );
    expect(header.kdf).toBe("hkdf");
  });

  it("uses a fresh salt and IV per encryption", async () => {
    const km = keyMaterial(3);
    const a = await encryptStringWithKeyMaterial(SEED, km);
    const b = await encryptStringWithKeyMaterial(SEED, km);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    // Both still open with the same key material.
    await expect(decryptStringWithKeyMaterial(a, km)).resolves.toBe(SEED);
    await expect(decryptStringWithKeyMaterial(b, km)).resolves.toBe(SEED);
  });

  it("refuses different key material — a passkey can't open another's wrap", async () => {
    const payload = await encryptStringWithKeyMaterial(SEED, keyMaterial(9));
    await expect(decryptStringWithKeyMaterial(payload, keyMaterial(10))).rejects.toThrow(
      /can't unlock this wallet/i,
    );
  });

  it("refuses key material shorter than 32 bytes", async () => {
    await expect(encryptStringWithKeyMaterial(SEED, keyMaterial(1, 16))).rejects.toThrow(
      /too short/i,
    );
  });

  it("detects tampering with the ciphertext (AES-GCM authentication)", async () => {
    const km = keyMaterial(4);
    const payload = await encryptStringWithKeyMaterial(SEED, km);
    const [prefix, header, body] = payload.ciphertext.split(":");
    const bytes = Buffer.from(body, "base64");
    bytes[0] ^= 0xff;
    const tampered = { ...payload, ciphertext: `${prefix}:${header}:${bytes.toString("base64")}` };
    await expect(decryptStringWithKeyMaterial(tampered, km)).rejects.toThrow();
  });
});

describe("password and biometric paths stay separate", () => {
  it("a password cannot be used to open a biometric wrap", async () => {
    const payload = await encryptStringWithKeyMaterial(SEED, keyMaterial(2));
    await expect(decryptString(payload, "correct horse battery staple")).rejects.toThrow(
      /unlocked with biometrics/i,
    );
  });

  it("key material cannot be used to open a password wrap", async () => {
    const payload = await encryptString(SEED, "correct horse battery staple");
    await expect(decryptStringWithKeyMaterial(payload, keyMaterial(2))).rejects.toThrow(
      /unlocked with a password/i,
    );
  });

  it("still round-trips the existing password wrap unchanged", async () => {
    const payload = await encryptString(SEED, "correct horse battery staple");
    expect(payload.iterations).toBe(0);
    await expect(decryptString(payload, "correct horse battery staple")).resolves.toBe(SEED);
    await expect(decryptString(payload, "wrong password")).rejects.toThrow(/Incorrect password/i);
  });

  it("reports an unknown KDF as a version problem, not corruption", async () => {
    const header = Buffer.from(JSON.stringify({ kdf: "future-kdf" })).toString("base64url");
    const payload = {
      ciphertext: `v2:${header}:AAAA`,
      salt: Buffer.alloc(16).toString("base64"),
      iv: Buffer.alloc(12).toString("base64"),
      iterations: 0,
    };
    await expect(decryptString(payload, "whatever")).rejects.toThrow(/newer version/i);
  });
});
