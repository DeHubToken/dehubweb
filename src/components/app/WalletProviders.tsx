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
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { StageProvider } from '@/contexts/StageContext';

interface WalletProvidersProps {
  children: ReactNode;
}

export function WalletProviders({ children }: WalletProvidersProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider theme={darkTheme()} modalSize="compact">
        <AuthProvider>
          <StageProvider>
            {children}
          </StageProvider>
        </AuthProvider>
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
