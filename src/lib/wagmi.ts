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
  allowUnsupportedChain: false,
  features: {
    analytics: true,
    email: false,
    socials: false,
    legalCheckbox: false,
  },
  termsConditionsUrl: '',
  privacyPolicyUrl: '',
  // Ensure extensions are explicitly enabled
  enableInjected: true,
  enableEIP6963: true,
  enableCoinbase: true,
  allWallets: 'SHOW',
  featuredWalletIds: [
    'c57ca71147597511ea610013372ad443', // MetaMask
    'fd20d473d0628e932ec06f6542ce91d4', // Coinbase Wallet
    'a797aa35c0fad5cf3a7f87051ae3079979b94fa82fd2ef37d825f0e2030245a4', // Phantom
    '4622a2b2d6ad1322744c74070a927a38b16c80c2f8149e21e90575d507119b4b', // Trust Wallet
  ],
  // Theme and visibility settings
  themeMode: 'dark',
  themeVariables: {
    '--w3m-z-index': 99999,
    '--w3m-accent': '#FFFFFF',
    '--w3m-border-radius-master': '1px',
    '--w3m-color-mix': 'rgba(24, 24, 27, 0.85)',
    '--w3m-color-mix-strength': 40,
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
