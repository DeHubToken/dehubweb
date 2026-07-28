// Reverse-direction parity: the web client must open a wallet created on mobile.
//
// dehub-mobile cannot reuse this module — Hermes has neither WebAssembly (so no
// hash-wasm Argon2id) nor SubtleCrypto — so it ships a parallel implementation
// over @noble's pure-JS primitives (dehub-mobile/libs/wallet-core/crypto.ts).
// Two implementations of one on-disk format is exactly the situation that
// silently diverges, and the cost of divergence here is a user who can't reach
// their funds from the other device.
//
// The mobile repo tests the web -> mobile direction against vectors generated
// from THIS file. This test covers mobile -> web, so both directions are pinned.
//
// The vector uses cheap Argon2id parameters (m=1024, t=1, p=1) to keep the suite
// fast. Parameters travel in the payload header, so this exercises the same
// decrypt path as a production payload; the production parameters themselves are
// asserted on the mobile side.
import { describe, expect, it } from "vitest";
import { decryptString, isLegacyPayload, type EncryptedPayload } from "../crypto";

const SEED =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PASSWORD = "correct horse battery staple";

// Written by dehub-mobile's libs/wallet-core/crypto.ts. Do not hand-edit —
// regenerate from the mobile implementation if the format intentionally changes.
const MOBILE_ARGON2ID: EncryptedPayload = {
  ciphertext:
    "v2:eyJrZGYiOiJhcmdvbjJpZCIsIm0iOjEwMjQsInQiOjEsInAiOjF9:HwFsqFjZqbQ+051FWEsUshLQytaMn+cJknQDVEO4jZ5flzpurVhNp56azK3OWxrqW/i/fyUV+1j+gYwjgObAFnx3cxfOOr9WPU05tnrachciRVfgqKzZcwSmsYZlDIyT+Wtj5HBsOz9oromgkA==",
  salt: "AxAdKjdEUV5reIWSn6y5xg==",
  iv: "ByRBXnuYtdLvDClG",
  iterations: 0,
};

describe("mobile parity", () => {
  it("decrypts a wallet created by the mobile client", async () => {
    expect(await decryptString(MOBILE_ARGON2ID, PASSWORD)).toBe(SEED);
  });

  it("treats the mobile payload as current, not legacy", () => {
    expect(isLegacyPayload(MOBILE_ARGON2ID)).toBe(false);
  });

  it("rejects a wrong password against a mobile payload", async () => {
    await expect(decryptString(MOBILE_ARGON2ID, "wrong password")).rejects.toThrow(
      /Incorrect password or corrupted data/,
    );
  });
});
