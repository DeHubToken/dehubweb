/**
 * Wagmi Configuration with RainbowKit
 * =====================================
 * Only 4 wallets: Rabby, MetaMask, Trust, Phantom.
 * RainbowKit handles mobile deep links, SDK relay, and "sign → return to browser" flow.
 * Generic injected() for auto-connect in wallet in-app browsers.
 */

import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { base } from 'wagmi/chains'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  phantomWallet,
  trustWallet,
  rabbyWallet,
  walletConnectWallet
} from '@rainbow-me/rainbowkit/wallets'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ''

/**
 * Prevent wagmi auto-reconnect on page load when there's no valid DeHub session.
 */
function clearStaleWagmiState() {
  if (typeof window === 'undefined') return;

  const savedSource = localStorage.getItem('dehub_connection_source');
  const token = localStorage.getItem('dehub_token');
  const timestamp = localStorage.getItem('dehub_token_timestamp');
  const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
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

// RainbowKit connectors: MetaMask, Phantom, Trust, Rabby only
// These handle desktop extension AND mobile (SDK relay / deep link → sign → return to browser)
const rainbowKitConnectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        phantomWallet,
        trustWallet,
        rabbyWallet,
        walletConnectWallet,
      ],
    },
  ],
  {
    appName: 'DeHub',
    projectId,
  }
)

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    ...rainbowKitConnectors,
    // Hidden fallback for mobile in-app browsers (Trust, MetaMask, etc.)
    // that inject window.ethereum but may not support EIP-6963 discovery.
    // Not shown in RainbowKit UI — only used programmatically for auto-connect.
    injected(),
  ],
  transports: {
    [base.id]: http('https://base-rpc.publicnode.com'),
  },
  // Default is 4000ms — way too aggressive. We don't watch blocks actively.
  pollingInterval: 30_000,
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
