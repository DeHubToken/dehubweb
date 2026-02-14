/**
 * Wagmi Configuration (Pure wagmi - no AppKit)
 * =============================================
 * Uses wagmi connectors directly for wallet connections.
 * Injected connector handles MetaMask, Trust Wallet, Coinbase, etc.
 */

import { createConfig, http } from 'wagmi'
import { base } from 'viem/chains'
import { injected } from 'wagmi/connectors'

/**
 * Prevent wagmi auto-reconnect on page load when there's no valid DeHub session.
 * Runs BEFORE config creation to prevent stale wallet connections.
 */
function clearStaleWagmiState() {
  const savedSource = localStorage.getItem('dehub_connection_source');
  const hasToken = !!localStorage.getItem('dehub_auth_token');

  if (savedSource !== 'wagmi' || !hasToken) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('wagmi') || key.startsWith('@appkit') || key.startsWith('wc@'))) {
        keysToRemove.push(key);
      }
    }
    if (keysToRemove.length > 0) {
      console.log('[Wagmi] Clearing stale state:', keysToRemove.length, 'keys');
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
  }
}

clearStaleWagmiState();

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [base.id]: http('https://base-rpc.publicnode.com'),
  },
})

/**
 * Clear all wagmi stored state. Call on disconnect to prevent
 * auto-reconnect on next page load.
 */
export function clearWagmiStorage() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('wagmi') || key.startsWith('@appkit') || key.startsWith('wc@'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log('[Wagmi] Cleared storage:', keysToRemove.length, 'keys');
}
