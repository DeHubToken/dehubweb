/**
 * Wagmi configuration — the part that boots.
 * ==========================================
 * The config every visitor pays for at first paint, so it carries exactly one
 * connector: the generic `injected()` that reaches whatever wallet a mobile
 * in-app browser exposes as window.ethereum. Everything a visitor might *pick*
 * — MetaMask (and its SDK), Phantom, Trust, WalletConnect, all built through
 * RainbowKit — lives in lib/wagmi-wallets and is added to this same config the
 * first time the login sheet, a linked-wallet connect, or a returning
 * external-wallet session asks for it.
 *
 * Why the split: wagmi runs each connector's setup() when the config is
 * created, and MetaMask's connector setup() imports and initialises the whole
 * MetaMask SDK. Together with RainbowKit's barrel and WalletConnect that was
 * ~500 KB of JavaScript evaluated on every visit to the home page, for a
 * modal most visitors never open — the biggest single item in the 2026-09-02
 * Lighthouse run. EIP-6963 discovery of installed extensions is unaffected;
 * wagmi adds those connectors on its own, and the sheet lists them.
 */

import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { base, bsc, mainnet } from 'wagmi/chains'
import { robinhood, ROBINHOOD_PUBLIC_RPC } from '@/lib/chains/robinhood'

export const WALLET_CONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ''

import { hasReturningWagmiSession, clearWagmiStorage } from '@/lib/wagmi-session'
// Re-exported so existing importers keep working. Both live in a wagmi-free
// module because the boot path (WalletProviders, AuthProvider) must answer
// "is there a wallet session?" and forget one without loading wagmi — this
// module creates the wagmi config on import.
export { hasReturningWagmiSession, clearWagmiStorage }

/**
 * Prevent wagmi auto-reconnect on page load when there's no valid DeHub session.
 */
function clearStaleWagmiState() {
  if (typeof window === 'undefined') return;

  if (!hasReturningWagmiSession()) {
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
void clearStaleWagmiState;

export const wagmiConfig = createConfig({
  // Robinhood Chain is registered even while its stream contracts are still
  // being deployed: a wallet already sitting on 4663 should be recognised
  // rather than reported as an unsupported network. What gates the user-facing
  // pickers is ROBINHOOD_ENABLED in lib/chains/constants.
  chains: [base, bsc, mainnet, robinhood],
  connectors: [
    // Hidden fallback for mobile in-app browsers (Trust, MetaMask, etc.)
    // that inject window.ethereum but may not support EIP-6963 discovery.
    // Not shown in RainbowKit UI — only used programmatically for auto-connect.
    // The curated wallets are prepended by lib/wagmi-wallets on demand.
    injected(),
  ],
  transports: {
    [base.id]: http('https://base-rpc.publicnode.com'),
    [bsc.id]: http('https://bsc-dataseed.binance.org'),
    [mainnet.id]: http('https://ethereum-rpc.publicnode.com'),
    [robinhood.id]: http(ROBINHOOD_PUBLIC_RPC),
  },
  // Default is 4000ms — way too aggressive. We don't watch blocks actively.
  pollingInterval: 30_000,
})
