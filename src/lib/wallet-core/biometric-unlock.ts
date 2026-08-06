// Biometric wallet unlock, end to end.
//
// Composes passkey.ts (WebAuthn PRF) with passkey-store.ts (persistence) and
// crypto.ts (the `hkdf` wrap) so UI code never touches key material directly.
// Every function here either completes or throws — nothing is left half
// written, and no plaintext secret or PRF output is retained after the call.
import { encryptStringWithKeyMaterial, decryptStringWithKeyMaterial } from "./crypto";
import {
  enrollWalletPasskey,
  evaluatePrf,
  PasskeyUnsupportedError,
  type PasskeyRef,
} from "./passkey";
import {
  deletePasskeyWrap,
  loadPasskeyWraps,
  savePasskeyWrap,
  touchPasskeyWrap,
  getPasskeyAccountLabel,
  type PasskeyWrap,
} from "./passkey-store";

// Re-exported so UI code has a single import for the whole feature.
export { isBiometricUnlockAvailable, describeThisDevice, PasskeyCancelledError, PasskeyUnsupportedError } from "./passkey";
export type { PasskeyWrap } from "./passkey-store";

/**
 * Enrol this device's biometrics for `secret` (a mnemonic or 0x private key).
 *
 * Prompts for Face ID / Touch ID / device PIN, wraps the secret under the
 * resulting PRF output, and stores the wrap. Callers must already hold the
 * plaintext secret — this never reads it from anywhere.
 */
export async function enrollBiometricUnlock(userId: string, secret: string): Promise<PasskeyWrap> {
  const accountLabel = await getPasskeyAccountLabel();
  const enrollment = await enrollWalletPasskey({ userId, accountLabel });
  const payload = await encryptStringWithKeyMaterial(secret, enrollment.keyMaterial);
  // Drop the PRF bytes as soon as the wrap exists.
  enrollment.keyMaterial.fill(0);
  await savePasskeyWrap(userId, {
    credentialId: enrollment.credentialId,
    prfSalt: enrollment.prfSalt,
    payload,
    label: enrollment.label,
  });
  markBiometricUsableHere(userId);
  return {
    credentialId: enrollment.credentialId,
    prfSalt: enrollment.prfSalt,
    payload,
    label: enrollment.label,
    createdAt: null,
    lastUsedAt: null,
  };
}

/**
 * Unlock with biometrics and return the wallet secret.
 *
 * The authenticator picks which enrolled credential answers, so we open the
 * wrap belonging to the credential that responded. Other wraps are tried as a
 * fallback only because credential ids can differ in encoding across
 * platforms — an unrelated wrap simply fails AES-GCM authentication, so this
 * cannot open the wrong wallet silently.
 */
export async function unlockWithBiometrics(
  userId: string,
  knownWraps?: PasskeyWrap[],
): Promise<string> {
  const wraps = knownWraps?.length ? knownWraps : await loadPasskeyWraps(userId);
  if (!wraps.length) {
    throw new PasskeyUnsupportedError("Biometric unlock isn't set up for this account yet.");
  }

  const refs: PasskeyRef[] = wraps.map((w) => ({ credentialId: w.credentialId, prfSalt: w.prfSalt }));
  const { credentialId, keyMaterial } = await evaluatePrf(refs);

  const ordered = [
    ...wraps.filter((w) => w.credentialId === credentialId),
    ...wraps.filter((w) => w.credentialId !== credentialId),
  ];

  try {
    let lastError: unknown = null;
    for (const wrap of ordered) {
      try {
        const secret = await decryptStringWithKeyMaterial(wrap.payload, keyMaterial);
        void touchPasskeyWrap(userId, wrap.credentialId);
        markBiometricUsableHere(userId);
        return secret;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Biometric unlock failed. Try your password instead.");
  } finally {
    keyMaterial.fill(0);
  }
}

/**
 * Remove one enrolled device.
 *
 * Clears this device's "biometrics work here" marker when nothing is left to
 * unlock with, so the enrolment offer comes back instead of the account
 * silently reverting to password-only with no way to be asked again.
 */
export async function removeBiometricUnlock(userId: string, credentialId: string): Promise<void> {
  await deletePasskeyWrap(userId, credentialId);
  try {
    const remaining = await loadPasskeyWraps(userId);
    if (!remaining.length) forgetBiometricUsableHere(userId);
  } catch {
    // Couldn't confirm what's left — leaving the marker is the safe side; the
    // user can still enrol from Settings.
  }
}

// ── "Not now" memory ────────────────────────────────────────────────────────
// The unlock screen offers enrolment after a successful password unlock. That
// offer must be asked once, not on every login: re-prompting someone who
// already said no is exactly the friction this feature exists to remove.
// Kept per-user and device-local (a decision on one device says nothing about
// another), and capped so a shared browser can't grow it without bound.
// Settings always shows the option regardless of what's recorded here.

const OFFER_DECLINED_KEY = "dehub_biometric_offer_declined";
const MAX_REMEMBERED_USERS = 10;

function readDeclined(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFER_DECLINED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function hasDeclinedBiometricOffer(userId: string): boolean {
  return readDeclined().includes(userId);
}

export function declineBiometricOffer(userId: string): void {
  try {
    const next = [...new Set([...readDeclined(), userId])].slice(-MAX_REMEMBERED_USERS);
    localStorage.setItem(OFFER_DECLINED_KEY, JSON.stringify(next));
  } catch { /* private mode — worst case they're asked again */ }
}

/** Forget a past decline, e.g. once the user has actually enrolled. */
export function clearBiometricOfferDecline(userId: string): void {
  try {
    const next = readDeclined().filter((id) => id !== userId);
    if (next.length) localStorage.setItem(OFFER_DECLINED_KEY, JSON.stringify(next));
    else localStorage.removeItem(OFFER_DECLINED_KEY);
  } catch { /* ignore */ }
}

// ── "Biometrics have worked on this device" memory ──────────────────────────
// Wraps live in user_wallet_passkeys, which is account-wide: enrolling on a
// phone writes a row that a desktop browser can read but generally cannot use.
// So "this account has a wrap" says nothing about whether biometrics work
// HERE, and gating the enrolment offer on it left every later device stuck on
// the password forever — never offered enrolment, while the unlock screen
// still rendered a biometric button backed by a credential this device does
// not hold.
//
// The wrap list can't answer the question either way, because passkeys do sync
// within an ecosystem (iCloud Keychain, Google Password Manager) and WebAuthn
// deliberately gives no way to enumerate what's present. The only honest
// signal is whether biometrics have actually succeeded on this device, so
// that's what we record — on enrolment or on a real unlock.

const USABLE_HERE_KEY = "dehub_biometric_usable_here";

function readUsableHere(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(USABLE_HERE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** True once biometrics have successfully enrolled or unlocked on this device. */
export function hasBiometricUsableHere(userId: string): boolean {
  return readUsableHere().includes(userId);
}

export function markBiometricUsableHere(userId: string): void {
  try {
    const next = [...new Set([...readUsableHere(), userId])].slice(-MAX_REMEMBERED_USERS);
    localStorage.setItem(USABLE_HERE_KEY, JSON.stringify(next));
  } catch { /* private mode — worst case they're offered enrolment again */ }
}

/** Drop the marker when the last credential is removed, so the offer returns. */
export function forgetBiometricUsableHere(userId: string): void {
  try {
    const next = readUsableHere().filter((id) => id !== userId);
    if (next.length) localStorage.setItem(USABLE_HERE_KEY, JSON.stringify(next));
    else localStorage.removeItem(USABLE_HERE_KEY);
  } catch { /* ignore */ }
}
