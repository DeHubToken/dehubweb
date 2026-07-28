/**
 * Wagmi Configuration with RainbowKit
 * =====================================
 * Only 4 wallets: Rabby, MetaMask, Trust, Phantom.
 * RainbowKit handles mobile deep links, SDK relay, and "sign → return to browser" flow.
 * Generic injected() for auto-connect in wallet in-app browsers.
 */

import { http, createConfig, createConnector } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { base, bsc, mainnet } from 'wagmi/chains'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import type { Wallet } from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  phantomWallet,
  trustWallet,
  walletConnectWallet
} from '@rainbow-me/rainbowkit/wallets'

/**
 * RainbowKit's phantomWallet()/trustWallet() resolve the injected provider
 * ONCE, synchronously, when connectorsForWallets() runs at module load —
 * before some extensions have finished injecting. With multiple wallet
 * extensions installed, whichever hasn't injected yet at that instant loses
 * the race, and RainbowKit's internal fallback (window.ethereum.providers[0])
 * silently binds this button to a DIFFERENT wallet (e.g. clicking "Phantom"
 * connects to Trust). Re-resolve lazily, at connect-click time, instead.
 */
function findTrustProvider(): any {
  const eth = (window as any).ethereum
  const providers = eth?.providers as any[] | undefined
  const isTrust = (p: any) => !!p && (p.isTrustWallet || p.isTrust)
  if (providers) return providers.find(isTrust)
  return isTrust(eth) ? eth : undefined
}

function withLazyInjectedTarget(
  wallet: Wallet,
  resolve: () => any,
): Wallet {
  return {
    ...wallet,
    createConnector: (walletDetails) =>
      createConnector((config) => ({
        ...injected({ target: () => ({ id: wallet.id, name: wallet.name, provider: resolve() }) })(config),
        ...walletDetails,
      })),
  }
}

function lazyPhantomWallet(): Wallet {
  // phantomWallet() never falls back to WalletConnect — always safe to override.
  return withLazyInjectedTarget(phantomWallet(), () => (window as any).phantom?.ethereum)
}

function lazyTrustWallet(params: { projectId: string }): Wallet {
  const base = trustWallet(params)
  // Only override when RainbowKit itself detected an injected Trust provider
  // at call time — otherwise leave its WalletConnect/QR fallback untouched.
  if (!base.installed) return base
  return withLazyInjectedTarget(base, findTrustProvider)
}

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

// NOTE: clearStaleWagmiState() is NOT called at module scope anymore.
// Wagmi state is only cleared during explicit disconnect (clearWagmiStorage).
// This preserves connector state so returning users can re-sign without a fresh connection.

// RainbowKit connectors: MetaMask, Phantom, Trust, Rabby only
// These handle desktop extension AND mobile (SDK relay / deep link → sign → return to browser)
const rainbowKitConnectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        lazyPhantomWallet,
        lazyTrustWallet,
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
  chains: [base, bsc, mainnet],
  connectors: [
    ...rainbowKitConnectors,
    // Hidden fallback for mobile in-app browsers (Trust, MetaMask, etc.)
    // that inject window.ethereum but may not support EIP-6963 discovery.
    // Not shown in RainbowKit UI — only used programmatically for auto-connect.
    injected(),
  ],
  transports: {
    [base.id]: http('https://base-rpc.publicnode.com'),
    [bsc.id]: http('https://bsc-dataseed.binance.org'),
    [mainnet.id]: http('https://ethereum-rpc.publicnode.com'),
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
