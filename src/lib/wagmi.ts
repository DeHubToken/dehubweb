/**
 * Wagmi + Reown AppKit Configuration
 * =============================================
 * Uses Reown AppKit for a premium wallet connection experience.
 * This ensures users can see and connect all their available wallets.
 */

import { base } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { createAppKit } from '@reown/appkit/react'
import { http } from 'wagmi'

// WalletConnect project ID from Reown Dashboard
export const projectId = 'e6db175d9deccba51bc4414384e9c089'

/**
 * Prevent wagmi auto-reconnect on page load when there's no valid DeHub session.
 * Runs BEFORE config creation to prevent stale wallet connections.
 */
function clearStaleWagmiState() {
  if (typeof window === 'undefined') return;

  const savedSource = localStorage.getItem('dehub_connection_source');
  const token = localStorage.getItem('dehub_token');
  const timestamp = localStorage.getItem('dehub_token_timestamp');
  const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days - match core.ts
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

const metadata = {
  name: 'DeHub',
  description: 'DeHub Social App',
  url: 'https://dehub.io',
  icons: ['https://dehub.io/favicon.ico'],
  redirect: {
    native: 'dehub://',
    universal: 'https://dehub.io/app'
  }
}

const networks = [base] as [any, ...any[]]

// 1. Create Wagmi Adapter
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  transports: {
    [base.id]: http('https://base-rpc.publicnode.com'),
  }
})

// 2. Export wagmiConfig for WagmiProvider
export const wagmiConfig = wagmiAdapter.wagmiConfig

// 3. Initialize Reown AppKit
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: base,
  projectId,
  metadata,
  features: {
    analytics: true,
    email: false, // DeHub uses Web3Auth for email
    socials: false, // DeHub uses Web3Auth for socials
  },
  // Hide all wallets except WalletConnect to fix desktop SVG errors
  enableInjected: false,
  enableEIP6963: false,
  enableCoinbase: false,
  allWallets: 'HIDE',
  featuredWalletIds: [],
  // Theme and visibility settings
  themeMode: 'dark',
  themeVariables: {
    '--w3m-z-index': 99999,
    '--w3m-accent': '#FFFFFF',
    '--w3m-border-radius-master': '1px',
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
