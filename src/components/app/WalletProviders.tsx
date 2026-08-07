/**
 * WalletProviders — lazy-loaded chunk
 * =====================================
 * Groups heavy wallet/auth providers so they load in a separate chunk
 * and don't block the initial page paint.
 *
 * Kept separate from the main App bundle so Wagmi (~300 KB), RainbowKit (~500 KB),
 * and Web3Auth (~1 MB) are fetched in parallel with the React core chunk and
 * only parsed after the first frame is displayed.
 */

import type { ReactNode } from 'react';
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
 * WagmiProvider stays. `wagmiConfig` calls `connectorsForWallets` from the same
 * RainbowKit root barrel and genuinely is needed at first paint, so the barrel
 * is still imported here transitively — the point is that nothing eager now
 * references the *provider*, leaving Rollup free to shake the modal UI out.
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
