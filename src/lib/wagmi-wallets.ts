/**
 * The curated wallet connectors — MetaMask, Phantom, Trust, WalletConnect —
 * built through RainbowKit and added to the boot config on demand.
 *
 * This module is the heavy half of what used to be lib/wagmi.ts: RainbowKit's
 * root barrel (connectorsForWallets ships only there, and the connect-modal UI
 * comes with it), the MetaMask SDK that MetaMask's connector initialises in
 * its setup(), and WalletConnect. Nothing on the boot path may import it
 * statically — reach it with `await import('@/lib/wagmi-wallets')` and the
 * guard in scripts/check-entry-bundle.mjs will keep it that way.
 *
 * Who calls ensureWalletConnectors():
 *   - LoginWalletsStep, before it renders RainbowKit's WalletButtons (which
 *     throw "Connector not found" for a wallet that is not in the config);
 *   - connectWithWallet in AuthProvider and the linked-wallet sheet, before
 *     they look a connector up;
 *   - loadWalletProviders, at boot, only for a browser holding a live
 *     external-wallet session — reconnect-on-mount needs the connector present.
 *
 * wagmi supports this: it adds EIP-6963 connectors to a live config the same
 * way, through `config._internal.connectors.setup` + `setState`.
 */

import { createConnector } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import type { Wallet } from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  phantomWallet,
  trustWallet,
  walletConnectWallet
} from '@rainbow-me/rainbowkit/wallets'
import { wagmiConfig, WALLET_CONNECT_PROJECT_ID } from '@/lib/wagmi'

/**
 * RainbowKit's phantomWallet()/trustWallet() resolve the injected provider
 * ONCE, synchronously, when connectorsForWallets() runs — before some
 * extensions have finished injecting. With multiple wallet extensions
 * installed, whichever hasn't injected yet at that instant loses the race, and
 * RainbowKit's internal fallback (window.ethereum.providers[0]) silently binds
 * this button to a DIFFERENT wallet (e.g. clicking "Phantom" connects to
 * Trust). Re-resolve lazily, at connect-click time, instead.
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

/** Whether the curated connectors are already in the config. */
export function walletConnectorsReady(): boolean {
  return wagmiConfig.connectors.some((connector) => 'rkDetails' in connector)
}

/**
 * Build the curated connectors once and put them in front of everything wagmi
 * discovered on its own, which is the order the old static config had. Safe
 * to call repeatedly; synchronous, so a caller that has awaited this module
 * can look a connector up on the next line.
 */
export function ensureWalletConnectors(): void {
  if (walletConnectorsReady()) return

  // RainbowKit connectors: MetaMask, Phantom, Trust, WalletConnect.
  // These handle desktop extension AND mobile (SDK relay / deep link → sign → return to browser).
  const connectorFns = connectorsForWallets(
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
      projectId: WALLET_CONNECT_PROJECT_ID,
    }
  )

  const { setup, setState } = wagmiConfig._internal.connectors
  const built = connectorFns.map((connectorFn) => setup(connectorFn))
  setState((current) => [...built, ...current])
}
