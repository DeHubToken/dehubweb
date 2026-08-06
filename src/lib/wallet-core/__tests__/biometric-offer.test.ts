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
  hasBiometricUsableHere,
  markBiometricUsableHere,
  forgetBiometricUsableHere,
} from "../biometric-unlock";

const KEY = "dehub_biometric_offer_declined";
const USABLE_KEY = "dehub_biometric_usable_here";
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

/**
 * The offer used to be gated on "this account has no wraps at all". Wraps are
 * account-wide, so enrolling on a phone silenced the offer on every other
 * device the user owned — they kept typing the password there and were never
 * asked again. The gate is now this device-local marker instead.
 */
describe("biometric 'works on this device' marker", () => {
  beforeEach(() => localStorage.clear());

  it("is false until biometrics have actually succeeded here", () => {
    expect(hasBiometricUsableHere(USER_A)).toBe(false);
    markBiometricUsableHere(USER_A);
    expect(hasBiometricUsableHere(USER_A)).toBe(true);
  });

  it("is independent of the decline list — declining is not the same as working", () => {
    declineBiometricOffer(USER_A);
    expect(hasBiometricUsableHere(USER_A)).toBe(false);
  });

  it("is per-user, so a shared browser doesn't silence a second account", () => {
    markBiometricUsableHere(USER_A);
    expect(hasBiometricUsableHere(USER_B)).toBe(false);
  });

  it("does not duplicate an account on repeated marks", () => {
    markBiometricUsableHere(USER_A);
    markBiometricUsableHere(USER_A);
    expect(JSON.parse(localStorage.getItem(USABLE_KEY)!)).toEqual([USER_A]);
  });

  it("caps how many accounts a shared browser remembers", () => {
    for (let i = 0; i < 15; i += 1) markBiometricUsableHere(`user-${i}`);
    const stored = JSON.parse(localStorage.getItem(USABLE_KEY)!);
    expect(stored).toHaveLength(10);
    expect(stored).toContain("user-14");
    expect(stored).not.toContain("user-0");
  });

  it("brings the offer back once the last credential is removed", () => {
    markBiometricUsableHere(USER_A);
    markBiometricUsableHere(USER_B);
    forgetBiometricUsableHere(USER_A);
    expect(hasBiometricUsableHere(USER_A)).toBe(false);
    expect(hasBiometricUsableHere(USER_B)).toBe(true);
  });

  it("removes the key entirely once nothing is left to remember", () => {
    markBiometricUsableHere(USER_A);
    forgetBiometricUsableHere(USER_A);
    expect(localStorage.getItem(USABLE_KEY)).toBeNull();
  });

  it("treats a corrupt entry as 'never worked here' rather than throwing", () => {
    localStorage.setItem(USABLE_KEY, "{not json");
    expect(hasBiometricUsableHere(USER_A)).toBe(false);
    localStorage.setItem(USABLE_KEY, JSON.stringify({ not: "an array" }));
    expect(hasBiometricUsableHere(USER_A)).toBe(false);
  });
});
