/**
 * Connect-and-verify body for ConnectLinkedWalletModal — lazy-loaded because
 * it pulls the same RainbowKit chunk as the login sheet's wallet step.
 *
 * The session already knows which address it belongs to (the address the
 * account last signed in with), so unlike the login sheet nothing here signs
 * anything: a wallet is connected, its address is compared against the
 * session's, and only a match is kept. A mismatch names the address the
 * account expects and drops the connection — AuthProvider's wagmi watcher is
 * told to stand down for the duration (setWalletReconnectGuard), so the
 * mismatch reads as "wrong wallet, try again" instead of triggering the
 * account-switch handling a stray extension connect normally gets.
 */
import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { toast } from 'sonner';
import { LoginWalletsStep, type WalletId } from '../login/LoginWalletsStep';
import { connectorMatchesWallet } from '@/lib/wallet-connectors';
import { clearWagmiStorage, wagmiConfig } from '@/lib/wagmi';
import { WagmiScope } from '@/components/app/WagmiScope';
import { writeConnectionSource } from '@/lib/connection-source';
import { setWalletReconnectGuard } from '@/lib/wallet-reconnect';
import { isUserRejection } from '@/lib/wallet-errors';
import { isMobileDevice, isWalletInAppBrowser } from '@/lib/web3auth';

interface ConnectLinkedWalletBodyProps {
  /** The session's wallet — the only address a connection is kept for. */
  expectedAddress: string;
  onConnected: () => void;
}

const shortenAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * WagmiProvider no longer wraps the app (see WagmiRuntime.tsx); this body calls
 * wagmi hooks, so it provides one for its own subtree. Lazy file, so the wagmi
 * import stays off the boot path.
 */
export function ConnectLinkedWalletBody(props: ConnectLinkedWalletBodyProps) {
  return (
    <WagmiScope>
      <ConnectLinkedWalletBodyInner {...props} />
    </WagmiScope>
  );
}

function ConnectLinkedWalletBodyInner({ expectedAddress, onConnected }: ConnectLinkedWalletBodyProps) {
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { address: connectedAddress } = useAccount();
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  // Buttons lock only while a connectAsync of ours is genuinely in flight.
  // The RainbowKit-driven paths (WalletConnect, mobile relay) never set this:
  // their modals can be dismissed without telling us, and a lock keyed on
  // "did we start something" would leave the sheet dead after a closed QR.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stand the account-switch handling down for as long as this sheet is up —
  // not just per connect attempt, because the WalletConnect path delivers its
  // address whenever the phone finishes scanning, well after connect() returned.
  useEffect(() => {
    setWalletReconnectGuard(true);
    return () => setWalletReconnectGuard(false);
  }, []);

  // The verdict lives on the wagmi address, not on connectAsync's return
  // value, so every way an address can arrive (extension popup, an
  // already-authorized silent connect, WalletConnect relay) lands in the same
  // check.
  useEffect(() => {
    if (!connectedAddress) return;
    if (connectedAddress.toLowerCase() === expectedAddress.toLowerCase()) {
      // The session's signatures come from this wallet from here on. The tag
      // is usually 'wagmi' already (the email-link login writes it), but a
      // pre-tagging session or a healed unlock hand-off arrives as 'web3auth'
      // — and a verified match is the proof that makes rewriting it safe.
      writeConnectionSource('wagmi');
      setActiveProvider(null);
      setError(null);
      toast.success('Right wallet connected — you’re all set.');
      onConnected();
      return;
    }
    setActiveProvider(null);
    setError(
      `That wallet isn’t the one linked to this account — it expects ${shortenAddress(expectedAddress)}. ` +
        'Switch to that account in your wallet and try again.',
    );
    clearWagmiStorage();
    disconnectAsync().catch(() => { /* already gone */ });
  }, [connectedAddress, expectedAddress, onConnected, disconnectAsync]);

  const handleWalletConnect = (wallet: WalletId, connect: () => void) => {
    setError(null);
    setActiveProvider(wallet);

    // Mobile outside a wallet's in-app browser: NOT the login sheet's deep
    // link, which navigates this page into the wallet's own browser — a fresh
    // context where the email-established session this sheet exists to serve
    // doesn't exist. RainbowKit's connect flow is the one that hops to the
    // wallet app for approval and returns here with the session intact.
    if (isMobileDevice() && !isWalletInAppBrowser()) {
      connect();
      return;
    }

    void (async () => {
      setBusy(true);
      try {
        // Curated connectors are added to the config on demand (lib/wagmi-wallets).
        const { ensureWalletConnectors } = await import('@/lib/wagmi-wallets');
        ensureWalletConnectors();
        const liveConnectors = wagmiConfig.connectors;
        let connector = liveConnectors.find((c) => connectorMatchesWallet(c, wallet));
        if (!connector && isWalletInAppBrowser()) {
          connector = liveConnectors.find((c) => c.id === 'injected');
        }
        if (!connector) {
          throw new Error('That wallet was not detected in this browser.');
        }
        await connectAsync({ connector });
        // Verification happens in the address effect above.
      } catch (err: any) {
        setActiveProvider(null);
        if (err?.name === 'ConnectorAlreadyConnectedError') return; // address effect has it
        if (isUserRejection(err)) return; // closing the popup is a "not now", not a failure
        setError(err instanceof Error ? err.message : 'Could not connect — please try again.');
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleWalletConnectConnect = (connect: () => void) => {
    setError(null);
    setActiveProvider('walletconnect');
    // RainbowKit's WalletConnect modal drives this one; the address arrives
    // through the effect above when the phone approves.
    connect();
  };

  return (
    <div className="space-y-3">
      <LoginWalletsStep
        isConnecting={busy}
        activeProvider={activeProvider}
        onWalletConnect={handleWalletConnect}
        onWalletConnectConnect={handleWalletConnectConnect}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-white/40 text-xs text-center">
        This account’s wallet: {shortenAddress(expectedAddress)}. Connecting a different one won’t
        affect your session — we’ll just ask you to switch.
      </p>
    </div>
  );
}

export default ConnectLinkedWalletBody;
