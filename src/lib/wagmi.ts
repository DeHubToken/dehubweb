/**
 * Wagmi Configuration
 * =============================================
 * Uses standard Wagmi connectors for a stable wallet connection experience.
 * Removes Reown AppKit UI dependencies to avoid issues with modal loading.
 */

import { http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'

// WalletConnect project ID
export const projectId = 'e6db175d9deccba51bc4414384e9c089'

/**
 * Prevent wagmi auto-reconnect on page load when there's no valid DeHub session.
 */
function clearStaleWagmiState() {
  if (typeof window === 'undefined') return;

  const savedSource = localStorage.getItem('dehub_connection_source');
  const token = localStorage.getItem('dehub_token');
  const timestamp = localStorage.getItem('dehub_token_timestamp');
  const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const isExpired = !timestamp || (Date.now() - parseInt(timestamp, 10)) >= TOKEN_EXPIRY_MS;
  const hasValidToken = !!token && !isExpired;

  if (savedSource !== 'wagmi' || !hasValidToken) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('wagmi') || key.startsWith('@appkit') || key.startsWith('@w3m') || key.startsWith('wc@') || key.startsWith('WCM@') || key.startsWith('W3M'))) {
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

// 1. Create Wagmi Config
export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    injected(),
    coinbaseWallet({
      appName: 'DeHub',
    }),
    walletConnect({
      projectId,
      showQrModal: true,
    }),
  ],
  transports: {
    [base.id]: http(),
  },
})

/**
 * Clear all wagmi stored state. Call on disconnect to prevent
 * auto-reconnect on next page load.
 */
export function clearWagmiStorage() {
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
