/**
 * The local wallet cache now has to represent a wallet with NO password wrap
 * (biometrics only). These tests pin that a missing wrap round-trips as null
 * instead of invalidating the whole cached entry — the address alone is what
 * the biometric unlock path needs.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cacheWallet, getCachedWallet, clearWalletCache } from "../store";

const PAYLOAD = { ciphertext: "v2:abc:def", salt: "c2FsdA==", iv: "aXY=", iterations: 0 };
const ADDRESS = "0x1111111111111111111111111111111111111111";

describe("wallet cache", () => {
  beforeEach(() => clearWalletCache());

  it("round-trips a password-protected wallet", () => {
    cacheWallet({ ethAddress: ADDRESS, payload: PAYLOAD });
    expect(getCachedWallet()).toEqual({ ethAddress: ADDRESS, payload: PAYLOAD });
  });

  it("keeps a biometrics-only wallet, with a null payload", () => {
    cacheWallet({ ethAddress: ADDRESS, payload: null });
    expect(getCachedWallet()).toEqual({ ethAddress: ADDRESS, payload: null });
  });

  it("normalises a half-written payload to null rather than returning it", () => {
    // A wrap with no ciphertext can't decrypt anything; treat it as absent so
    // callers take the biometric path instead of failing on decrypt.
    localStorage.setItem(
      "dehub_wallet_enc",
      JSON.stringify({ ethAddress: ADDRESS, payload: { salt: "x", iv: "y", iterations: 0 } }),
    );
    expect(getCachedWallet()).toEqual({ ethAddress: ADDRESS, payload: null });
  });

  it("rejects an entry with no address", () => {
    localStorage.setItem("dehub_wallet_enc", JSON.stringify({ payload: PAYLOAD }));
    expect(getCachedWallet()).toBeNull();
  });

  it("returns null for absent or corrupt cache entries", () => {
    expect(getCachedWallet()).toBeNull();
    localStorage.setItem("dehub_wallet_enc", "{not json");
    expect(getCachedWallet()).toBeNull();
  });
});
