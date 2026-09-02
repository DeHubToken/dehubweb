/**
 * WagmiProvider for a subtree that calls wagmi hooks itself.
 *
 * WagmiProvider no longer wraps the app (see WagmiRuntime.tsx), so the few
 * lazily loaded surfaces that use wagmi hooks directly — the login sheet body,
 * the linked-wallet connect step, the ENS handle settings — provide it for
 * themselves. Same `wagmiConfig` instance as the runtime, so account state is
 * shared through wagmi's own store. Mounting this also mounts the runtime, so
 * AuthProvider sees the connection these surfaces make.
 *
 * Only ever import this from a lazily loaded module: it imports wagmi.
 */
import { useEffect, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi';
import { requestWalletRuntime } from '@/lib/wallet-runtime';

export function WagmiScope({ children }: { children: ReactNode }) {
  useEffect(() => {
    requestWalletRuntime();
  }, []);
  return <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>;
}
