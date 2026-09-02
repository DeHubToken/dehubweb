/**
 * WalletProviders — lazy-loaded chunk
 * =====================================
 * Groups heavy wallet/auth providers so they load in a separate chunk
 * and don't block the initial page paint.
 *
 * Kept separate from the main App bundle so the auth system is fetched in
 * parallel with the React core chunk and only parsed after the first frame is
 * displayed. wagmi and viem are not in this chunk either — see WagmiRuntime —
 * and the wallet SDKs (MetaMask, WalletConnect, RainbowKit) load with the
 * login sheet's wallet step.
 */

import { lazy, Suspense, type ReactNode } from 'react';
import { hasReturningWagmiSession } from '@/lib/wagmi-session';
import { requestWalletRuntime, useWalletRuntimeRequested } from '@/lib/wallet-runtime';
import { AuthProvider } from '@/contexts/AuthProvider';
import { CallProvider } from '@/contexts/CallContext';
import { StageProvider } from '@/contexts/StageContext';
import { CallModalsHost } from '@/components/app/chat/calls/CallModalsHost';

interface WalletProvidersProps {
  children: ReactNode;
}

// wagmi + viem live behind this boundary. Nothing in this file, AuthProvider,
// or anything else on the first-paint path may import 'wagmi' or '@/lib/wagmi'
// (which creates the config on import) — src/test/wagmi-boot-split.test.ts
// pins that.
const WagmiRuntime = lazy(() => import('@/components/app/WagmiRuntime'));

/**
 * Mounts the wagmi runtime once something has asked for it: a returning
 * external-wallet session at boot (loadWalletProviders), or the first wallet
 * surface to open (WagmiScope). Every other visitor never loads wagmi at all.
 */
function WalletRuntimeHost() {
  const requested = useWalletRuntimeRequested();
  if (!requested) return null;
  return (
    <Suspense fallback={null}>
      <WagmiRuntime />
    </Suspense>
  );
}

/**
 * RainbowKitProvider deliberately does NOT live here — it wraps the wallet
 * step inside the login sheet (see LoginWalletsStep).
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
 * WagmiProvider used to stay here, with the injected connector alone, which
 * still put wagmi + viem in front of every visitor's first render. It is now
 * a sibling of the app tree (WagmiRuntime), mounted on demand: AuthProvider
 * reads wagmi's account state through lib/wallet-runtime, and the surfaces
 * that call wagmi hooks themselves wrap their own subtree in WagmiScope.
 */
export function WalletProviders({ children }: WalletProvidersProps) {
  return (
    <>
      <WalletRuntimeHost />
      <AuthProvider>
        <CallProvider>
          <StageProvider>
            <CallModalsHost />
            {children}
          </StageProvider>
        </CallProvider>
      </AuthProvider>
    </>
  );
}

/**
 * What App.tsx lazy-loads. A browser holding a live external-wallet session
 * needs the connector that session was made with present BEFORE wagmi mounts,
 * or reconnect-on-mount finds nothing to restore and the user is signed in
 * without a wallet to sign with — so the curated connectors are built and the
 * runtime is requested here, before the tree renders. Everyone else — every
 * signed-out visitor, every passkey and social login — boots without wagmi,
 * and the login sheet mounts it the moment it needs it.
 */
export async function loadWalletProviders(): Promise<{ default: typeof WalletProviders }> {
  if (hasReturningWagmiSession()) {
    const { ensureWalletConnectors } = await import('@/lib/wagmi-wallets');
    ensureWalletConnectors();
    requestWalletRuntime();
  }
  return { default: WalletProviders };
}
