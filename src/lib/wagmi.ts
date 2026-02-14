import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { base } from '@reown/appkit/networks'
import { http } from 'viem'

// Reuse same WalletConnect project ID
const projectId = '0751965bb69056635999763785664539'

const metadata = {
  name: 'DeHub',
  description: 'DeHub Social App',
  url: 'https://dehub.io',
  icons: ['https://dehub.io/favicon.ico']
}

const networks = [base] as [typeof base]

/**
 * Prevent wagmi auto-reconnect on page load when there's no valid DeHub session.
 * This runs BEFORE createAppKit() to prevent the "Switch Network" popup
 * that appears when wagmi reconnects a wallet on the wrong chain.
 */
function clearStaleWagmiState() {
  const savedSource = localStorage.getItem('dehub_connection_source');
  const hasToken = !!localStorage.getItem('dehub_auth_token');

  // If user's last session was NOT wagmi, or there's no valid token,
  // clear wagmi's stored state to prevent unwanted auto-reconnect
  if (savedSource !== 'wagmi' || !hasToken) {
    // wagmi v2 stores reconnect state under these keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('wagmi') || key.startsWith('@appkit') || key.startsWith('wc@'))) {
        keysToRemove.push(key);
      }
    }
    if (keysToRemove.length > 0) {
      console.log('[Wagmi] Clearing stale wagmi/AppKit state (no valid DeHub wagmi session):', keysToRemove.length, 'keys');
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
  }
}

// Clear stale state before initializing
clearStaleWagmiState();

// Create Wagmi Adapter with custom RPC (mainnet.base.org returns 403)
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  transports: {
    [base.id]: http('https://base-rpc.publicnode.com'),
  },
})

// Create AppKit modal
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: false,
    email: false,     // Web3Auth handles email login
    socials: [],      // Web3Auth handles social login
    swaps: false,
    onramp: false,
  },
  allowUnsupportedChain: true, // Don't show "Switch Network" popup automatically
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#6d28d9',
    '--w3m-border-radius-master': '1px',
    '--w3m-font-family': 'Inter, sans-serif',
  }
})

// Export config for WagmiProvider
export const wagmiConfig = wagmiAdapter.wagmiConfig

/**
 * Clear all wagmi/AppKit stored state. Call on disconnect to prevent
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
  console.log('[Wagmi] Cleared wagmi/AppKit storage:', keysToRemove.length, 'keys');
}
