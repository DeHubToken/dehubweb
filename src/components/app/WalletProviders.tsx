/**
 * WalletProviders — lazy-loaded chunk
 * =====================================
 * Groups heavy wallet/auth providers so they load in a separate chunk
 * and don't block the initial page paint.
 *
 * Kept separate from the main App bundle so wagmi and the auth system are
 * fetched in parallel with the React core chunk and only parsed after the
 * first frame is displayed. The wallet SDKs themselves (MetaMask, WalletConnect,
 * RainbowKit) are not even in this chunk any more — see loadWalletProviders.
 */

import type { ReactNode } from 'react';
import { hasReturningWagmiSession } from '@/lib/wagmi';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi';
import { AuthProvider } from '@/contexts/AuthProvider';
import { CallProvider } from '@/contexts/CallContext';
import { StageProvider } from '@/contexts/StageContext';
import { CallModalsHost } from '@/components/app/chat/calls/CallModalsHost';

interface WalletProvidersProps {
  children: ReactNode;
}

/**
 * RainbowKitProvider deliberately does NOT live here — it wraps LoginModal
 * instead (see RainbowKitScope there).
 *
 * This component wraps the whole app tree, so everything it statically imports
 * is on the first-paint path. RainbowKit's only consumer in the app is
 * `WalletButton.Custom` inside LoginModal: there is no `useConnectModal`,
 * `ConnectButton` or `useAccountModal` anywhere in src, so its connect-modal UI
 * was being parsed by every visitor for a modal the app never opens.
 *
 * What that cost, measured on the Aug 2026 build: the eagerly-referenced
 * `en_US` chunk was 267 KB, while every other RainbowKit locale built as a
 * 37-65 KB lazy chunk — the difference being the shared modal UI, which Rollup
 * merged into whichever chunk the eager graph reached first.
 *
 * WagmiProvider stays, but `wagmiConfig` now boots with the injected connector
 * alone: the RainbowKit barrel, the MetaMask SDK and WalletConnect moved to
 * lib/wagmi-wallets and are added to the config on demand, so none of them is
 * on the first-paint path any more.
 */
export function WalletProviders({ children }: WalletProvidersProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <AuthProvider>
        <CallProvider>
          <StageProvider>
            <CallModalsHost />
            {children}
          </StageProvider>
        </CallProvider>
      </AuthProvider>
    </WagmiProvider>
  );
}

/**
 * What App.tsx lazy-loads. A browser holding a live external-wallet session
 * needs the connector that session was made with present BEFORE wagmi mounts,
 * or reconnect-on-mount finds nothing to restore and the user is signed in
 * without a wallet to sign with. Everyone else — every signed-out visitor,
 * every passkey and social login — boots without the wallet SDKs, and the
 * login sheet adds them the moment it needs them.
 */
export async function loadWalletProviders(): Promise<{ default: typeof WalletProviders }> {
  if (hasReturningWagmiSession()) {
    const { ensureWalletConnectors } = await import('@/lib/wagmi-wallets');
    ensureWalletConnectors();
  }
  return { default: WalletProviders };
}
