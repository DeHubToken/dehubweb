/**
 * Session-wallet reconnect
 * ========================
 * The counterpart of dehub:wallet-unlock-required for sessions whose
 * signatures come from an EXTERNAL wallet (MetaMask, Phantom, Trust) rather
 * than the built-in smart wallet.
 *
 * Such a session exists without its wallet attached in one ordinary case: the
 * account holder signed in through the email link (see EmailSignInSettings and
 * completeLoginWithoutUnlock), which establishes the full DeHub session with
 * zero key material — on a browser that may never have seen the wallet
 * extension at all. Everything token-backed works; the first tip, stake or
 * send then finds no signing provider anywhere. Until this module existed that
 * dead-ended in "No wallet connected. Please sign in first." — told to someone
 * who demonstrably IS signed in, with nothing on screen to connect a wallet.
 *
 * aa-utils raises the event; ConnectLinkedWalletModal (mounted app-wide in
 * AppContent) answers it with a connect-and-verify sheet.
 */

export const WALLET_CONNECT_REQUIRED_EVENT = 'dehub:wallet-connect-required';

/** Ask the app to open the connect-your-wallet sheet for the live session. */
export function requestSessionWalletConnect(): void {
  window.dispatchEvent(new Event(WALLET_CONNECT_REQUIRED_EVENT));
}

/**
 * True while the reconnect sheet is open and verifying a connection it asked
 * for.
 *
 * AuthProvider's wagmi watcher treats any connected address that differs from
 * the session's as an account switch — saving profiles, switching to them, or
 * toasting "your wallet switched accounts". A verification connect must get
 * none of that: the sheet compares the address itself and shows "wrong
 * wallet" in place, so the watcher's only job during this window is to drop
 * the mismatched connection quietly.
 *
 * Module state rather than context because the watcher lives in AuthProvider
 * and the sheet outside it; threading one boolean through the context surface
 * for this would be noise.
 */
let reconnectGuardActive = false;

export function setWalletReconnectGuard(active: boolean): void {
  reconnectGuardActive = active;
}

export function isWalletReconnectGuardActive(): boolean {
  return reconnectGuardActive;
}
