// "How can this wallet be unlocked, on this device, right now?"
//
// One answer, shared by the unlock screen and Settings, so the two can never
// disagree about whether biometrics or a password is available.
import { fetchWallet, getCachedWallet, type StoredWallet } from "./store";
import { isBiometricUnlockAvailable } from "./passkey";
import { loadPasskeyWraps, type PasskeyWrap } from "./passkey-store";

export interface WalletProtection {
  wallet: StoredWallet | null;
  /** A password wrap exists for this wallet. */
  hasPassword: boolean;
  /** Biometric wraps enrolled for this account (on any device). */
  wraps: PasskeyWrap[];
  /** This browser has a user-verifying platform authenticator. */
  biometricAvailable: boolean;
  /** Enrolled AND supported here — the only case where we offer biometrics. */
  canUseBiometrics: boolean;
  /**
   * Enrolled, but not usable in this browser. The user needs the device they
   * set it up on (or a password backup added from there).
   */
  biometricEnrolledElsewhere: boolean;
}

/**
 * The wallet row, preferring the server and falling back to the local
 * ciphertext cache so a flaky connection doesn't look like a missing wallet.
 */
export async function loadWalletOrCached(userId: string): Promise<StoredWallet> {
  try {
    const fresh = await fetchWallet(userId);
    if (fresh) return fresh;
  } catch {
    // Network hiccup — fall back to the local encrypted cache
  }
  const cached = getCachedWallet();
  if (cached) return cached;
  throw new Error("No wallet found for this account.");
}

export async function getWalletProtection(userId: string): Promise<WalletProtection> {
  // All three are independent and each degrades to a safe default, so probe
  // them together rather than serialising three round-trips on a login screen.
  const [walletResult, availableResult, wrapsResult] = await Promise.allSettled([
    loadWalletOrCached(userId),
    isBiometricUnlockAvailable(),
    loadPasskeyWraps(userId),
  ]);

  const wallet = walletResult.status === "fulfilled" ? walletResult.value : null;
  const biometricAvailable = availableResult.status === "fulfilled" ? availableResult.value : false;
  const wraps = wrapsResult.status === "fulfilled" ? wrapsResult.value : [];

  return {
    wallet,
    hasPassword: !!wallet?.payload,
    wraps,
    biometricAvailable,
    canUseBiometrics: biometricAvailable && wraps.length > 0,
    biometricEnrolledElsewhere: !biometricAvailable && wraps.length > 0,
  };
}
