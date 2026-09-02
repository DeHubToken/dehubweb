/**
 * The wagmi runtime: WagmiProvider plus a bridge that publishes wagmi's hook
 * values into lib/wallet-runtime.ts. Loaded lazily by WalletProviders, so
 * wagmi + viem only reach a browser that holds a wagmi session or opens a
 * wallet surface. See wallet-runtime.ts for the contract.
 *
 * Renders nothing visible. It is a SIBLING of the app tree, not a wrapper: the
 * surfaces that still call wagmi hooks themselves (the login sheet body, the
 * linked-wallet connect step, the ENS settings) wrap their own subtree in
 * WagmiScope, which provides the same config instance, so they share account
 * state with this bridge through wagmi's store rather than React context.
 */
import { useEffect } from 'react';
import { WagmiProvider, useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi';
import { publishWalletRuntime, retractWalletRuntime } from '@/lib/wallet-runtime';

function WagmiBridge() {
  const { address, isConnected, connector } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect, disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  useEffect(() => {
    publishWalletRuntime(
      { address, isConnected, connector, connectors },
      { connectAsync, disconnect, disconnectAsync, signMessageAsync },
    );
  }, [address, isConnected, connector, connectors, connectAsync, disconnect, disconnectAsync, signMessageAsync]);

  useEffect(() => () => retractWalletRuntime(), []);

  return null;
}

export function WagmiRuntime() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <WagmiBridge />
    </WagmiProvider>
  );
}

export default WagmiRuntime;
