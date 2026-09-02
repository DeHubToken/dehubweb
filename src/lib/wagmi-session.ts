/**
 * The wagmi session facts that the boot path needs WITHOUT loading wagmi.
 *
 * `hasReturningWagmiSession` decides whether the wagmi runtime is mounted at
 * all (WalletProviders) and whether the curated connectors are built
 * (loadWalletProviders); `clearWagmiStorage` is what sign-out calls to forget
 * a wallet. Both are plain localStorage logic, so they live here rather than
 * in `@/lib/wagmi`, which creates the wagmi config on import. `@/lib/wagmi`
 * re-exports them for the modules that already import that.
 */
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function hasReturningWagmiSession(): boolean {
  if (typeof window === 'undefined') return false;
  const savedSource = localStorage.getItem('dehub_connection_source');
  const token = localStorage.getItem('dehub_token');
  const timestamp = localStorage.getItem('dehub_token_timestamp');
  const isExpired = !timestamp || (Date.now() - parseInt(timestamp, 10)) >= TOKEN_EXPIRY_MS;
  return savedSource === 'wagmi' && !!token && !isExpired;
}

/** Wipe wagmi / WalletConnect / AppKit persistence. */
export function clearWagmiStorage(): void {
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('wagmi') || key.startsWith('@appkit') || key.startsWith('@w3m') || key.startsWith('wc@') || key.startsWith('WCM@') || key.startsWith('W3M'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log('[Wagmi] Cleared storage:', keysToRemove.length, 'keys');
}
