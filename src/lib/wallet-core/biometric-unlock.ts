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

/** Remove one enrolled device. */
export async function removeBiometricUnlock(userId: string, credentialId: string): Promise<void> {
  await deletePasskeyWrap(userId, credentialId);
}
