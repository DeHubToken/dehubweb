/**
 * The post-password enrolment offer must be a one-time question. If a decline
 * isn't remembered, every login re-asks — the exact friction biometrics is
 * meant to remove.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  hasDeclinedBiometricOffer,
  declineBiometricOffer,
  clearBiometricOfferDecline,
} from "../biometric-unlock";

const KEY = "dehub_biometric_offer_declined";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

describe("biometric enrolment offer", () => {
  beforeEach(() => localStorage.clear());

  it("is offered until declined", () => {
    expect(hasDeclinedBiometricOffer(USER_A)).toBe(false);
    declineBiometricOffer(USER_A);
    expect(hasDeclinedBiometricOffer(USER_A)).toBe(true);
  });

  it("is per-user — one account's decline doesn't silence another's", () => {
    declineBiometricOffer(USER_A);
    expect(hasDeclinedBiometricOffer(USER_B)).toBe(false);
  });

  it("does not duplicate an account on repeated declines", () => {
    declineBiometricOffer(USER_A);
    declineBiometricOffer(USER_A);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([USER_A]);
  });

  it("caps how many accounts a shared browser remembers", () => {
    for (let i = 0; i < 15; i += 1) declineBiometricOffer(`user-${i}`);
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored).toHaveLength(10);
    // The most recent declines are the ones kept.
    expect(stored).toContain("user-14");
    expect(stored).not.toContain("user-0");
  });

  it("clears one account's decline without touching others", () => {
    declineBiometricOffer(USER_A);
    declineBiometricOffer(USER_B);
    clearBiometricOfferDecline(USER_A);
    expect(hasDeclinedBiometricOffer(USER_A)).toBe(false);
    expect(hasDeclinedBiometricOffer(USER_B)).toBe(true);
  });

  it("removes the key entirely once nothing is left to remember", () => {
    declineBiometricOffer(USER_A);
    clearBiometricOfferDecline(USER_A);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("treats a corrupt entry as 'not declined' rather than throwing", () => {
    localStorage.setItem(KEY, "{not json");
    expect(hasDeclinedBiometricOffer(USER_A)).toBe(false);
    localStorage.setItem(KEY, JSON.stringify({ not: "an array" }));
    expect(hasDeclinedBiometricOffer(USER_A)).toBe(false);
  });
});
