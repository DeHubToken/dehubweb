// "How can this wallet be unlocked, on this device, right now?"
//
// One answer, shared by the unlock screen and Settings, so the two can never
// disagree about whether biometrics or a password is available.
import { supabase } from "@/integrations/supabase/client";
import { classifyPayloadKind } from "./crypto";
import { fetchWallet, getCachedWallet, type StoredWallet } from "./store";
import { isBiometricUnlockAvailable } from "./passkey";
import { getCachedPasskeyWraps, loadPasskeyWraps, type PasskeyWrap } from "./passkey-store";

export interface WalletProtection {
  wallet: StoredWallet | null;
  /**
   * A password wrap exists for this wallet. Judged from the payload's KDF
   * header, not mere presence: the mobile app's biometric wallets write an
   * hkdf-wrapped seed into the same column, and offering a password box for
   * one of those is a dead end no password can ever get through.
   */
  hasPassword: boolean;
  /**
   * The stored seed is wrapped under passkey/device key material (hkdf), i.e.
   * a mobile-app biometric wallet. The remedy lives on the device that made
   * it — say that, instead of asking for a password that does not exist.
   */
  seedIsPasskeyWrapped: boolean;
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
  /**
   * The server positively answered "this account has no wallet row" and no
   * local cache disagreed — i.e. the account has no built-in wallet at all
   * (its signatures come from an external wallet). A fetch FAILURE leaves
   * this false: unreachable is not the same as absent, and treating it as
   * absent would route a smart-wallet user away from their unlock options.
   * So does a missing Supabase auth session — user_wallets is RLS-scoped,
   * and an unauthenticated read comes back as zero rows rather than an
   * error, which reads exactly like "no wallet" and is not.
   */
  noWalletOnServer: boolean;
  /**
   * The probe learned nothing: no wallet, no wraps, and no positive "this
   * account has no wallet" from the server. Every field above is then a
   * default, not a fact — the reads failed, or ran without a Supabase session
   * for this user (expired, or a different profile's), where RLS answers with
   * zero rows instead of an error. A wallet with a password wrap and enrolled
   * devices looks EXACTLY like a bare biometrics-only wallet in that state,
   * so callers must show "couldn't check" surfaces, never protection claims.
   */
  stateUnknown: boolean;
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
  //
  // fetchWallet directly rather than loadWalletOrCached, because the two ways
  // of ending up with no wallet mean different things here: the server saying
  // "no row" identifies an account with no built-in wallet, while a failed
  // fetch identifies nothing. The cache fallback is reproduced below.
  const [walletResult, availableResult, wrapsResult, sessionResult] = await Promise.allSettled([
    fetchWallet(userId),
    isBiometricUnlockAvailable(),
    loadPasskeyWraps(userId),
    supabase.auth.getSession(),
  ]);

  const fetched = walletResult.status === "fulfilled" ? walletResult.value : null;
  const wallet = fetched ?? getCachedWallet();
  const authedRead =
    sessionResult.status === "fulfilled" && sessionResult.value.data?.session?.user?.id === userId;
  const noWalletOnServer = walletResult.status === "fulfilled" && !wallet && authedRead;
  const biometricAvailable = availableResult.status === "fulfilled" ? availableResult.value : false;
  let wraps = wrapsResult.status === "fulfilled" ? wrapsResult.value : [];
  // An unauthenticated read of user_wallet_passkeys "succeeds" with zero rows
  // — RLS hides the account's rows rather than erroring — so an expired
  // session must fall back to the device's cache the same way a failed fetch
  // does, or a device whose biometrics work fine gets told it has none.
  if (!authedRead && wraps.length === 0) wraps = getCachedPasskeyWraps();

  const payloadKind = wallet?.payload ? classifyPayloadKind(wallet.payload.ciphertext) : null;

  return {
    wallet,
    hasPassword: payloadKind === "password" || payloadKind === "unknown",
    seedIsPasskeyWrapped: payloadKind === "passkey",
    wraps,
    biometricAvailable,
    canUseBiometrics: biometricAvailable && wraps.length > 0,
    biometricEnrolledElsewhere: !biometricAvailable && wraps.length > 0,
    noWalletOnServer,
    stateUnknown: !wallet && wraps.length === 0 && !noWalletOnServer,
  };
}
