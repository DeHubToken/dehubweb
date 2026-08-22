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
  | 'wallets'
  | 'wallet-create'
  | 'wallet-unlock'
  | 'resuming';

/**
 * Which step a login already in progress belongs on, or null when nothing is in
 * progress and the caller should keep whatever step it is on.
 *
 * 'resuming' covers the gap between "the identity landed" and "we know which
 * wallet step it needs" — a wallet lookup plus a session exchange, i.e. two
 * network round-trips. Nothing about signing in belongs on screen during it.
 */
export function resumingStep(
  phase: 'none' | 'create' | 'unlock',
  isResolving: boolean,
): LoginStep | null {
  if (phase === 'create') return 'wallet-create';
  if (phase === 'unlock') return 'wallet-unlock';
  if (isResolving) return 'resuming';
  return null;
}
