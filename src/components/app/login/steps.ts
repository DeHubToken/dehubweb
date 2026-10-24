/**
 * The login sheet's step machine, in its own module so the eagerly-bundled
 * shell (LoginModal) and the lazily-loaded body agree on it without the shell
 * having to pull the body's chunk in.
 */
export type LoginStep =
  | 'main'
  | 'email'
  | 'email-waiting'
  | 'phone'
  | 'phone-code'
  // Passkey-only: the fingerprint/face passkey is the account. Two choices,
  // sign in with one that exists or create one, and nothing to type.
  | 'passkey'
  | 'wallets'
  | 'import-wallet'
  // The external-wallet equivalent of 'resuming': the connector has agreed and
  // the signature is out with the wallet. The wallet list has nothing left to
  // offer at that point — leaving it up (now captioned "Connected", because
  // wagmi is) is what made a successful login look like it had bounced back to
  // the picker.
  | 'wallet-signing'
  | 'wallet-create'
  // A silent sign-up's first wallet action: set a password or biometrics on
  // the wallet that already exists. The session is live; only this is asked.
  | 'wallet-secure'
  | 'wallet-unlock'
  // The profile lives on the wallet from the original sign-in, not the one
  // saved for this login. Recover that wallet to get in.
  | 'wallet-restore'
  // The account exists but has no profile yet — username, display name, and
  // optionally a picture and a reading language. Mandatory: the sheet will not
  // close while `requiresUsername` is set, so the only other way out is Log out.
  | 'profile'
  | 'resuming';

/** Identity choices share one form area; wallet security remains a focused step. */
export function isInlineLoginStep(step: LoginStep): boolean {
  return ['main', 'email', 'email-waiting', 'phone', 'phone-code', 'passkey', 'wallets', 'import-wallet'].includes(step);
}

/**
 * Which step a login already in progress belongs on, or null when nothing is in
 * progress and the caller should keep whatever step it is on.
 *
 * 'resuming' covers the gap between "the identity landed" and "we know which
 * wallet step it needs" — a wallet lookup plus a session exchange, i.e. two
 * network round-trips. Nothing about signing in belongs on screen during it.
 */
export function resumingStep(
  phase: 'none' | 'create' | 'unlock' | 'restore' | 'secure',
  isResolving: boolean,
): LoginStep | null {
  if (phase === 'create') return 'wallet-create';
  if (phase === 'secure') return 'wallet-secure';
  if (phase === 'unlock') return 'wallet-unlock';
  if (phase === 'restore') return 'wallet-restore';
  if (isResolving) return 'resuming';
  return null;
}
