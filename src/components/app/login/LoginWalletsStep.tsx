import { useTranslation as _useCopy } from 'react-i18next';
/**
 * The "Connect wallet" step — and the only thing in the login flow that needs
 * RainbowKit.
 *
 * It has its own lazily-loaded module because RainbowKit's shared UI is ~270 KB
 * of JavaScript that has to be *evaluated*, not merely downloaded, before
 * anything it wraps can render. Held inside LoginModal (where it used to be, as
 * a provider wrapped around the whole Drawer) that evaluation sat between the
 * click on "Log in" and the sheet's first frame — the sheet waited on code for
 * a step most people never open.
 *
 * RainbowKitProvider moving down here — inside the sheet rather than around it —
 * changes nothing about how RainbowKit behaves. Its theme is a `[data-rk]`
 * stylesheet, which is document-global wherever the provider renders, and its
 * connect modal portals to `document.body` and stamps `data-rk` on its own root.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Loader2 } from "lucide-react";
import ChevronRight from "@/components/ui/cut-icons/next";

import { WalletButton, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { Button } from '@/components/ui/button';
import { isMobileDevice, isWalletInAppBrowser } from '@/lib/web3auth';
import { METAMASK_LOGO, TRUST_LOGO } from './wallet-logos';
import phantomLogo from '@/assets/phantom-logo.png';

const MetaMaskIcon = () => (
  <img src={METAMASK_LOGO} width="20" height="20" alt="MetaMask" className="rounded-full object-contain" />
);

const PhantomIcon = () => (
  <img src={phantomLogo} width="20" height="20" alt="Phantom" className="rounded-full object-cover" />
);

const TrustIcon = () => (
  <img src={TRUST_LOGO} width="20" height="20" alt="Trust Wallet" className="rounded-full object-contain" />
);

const WalletConnectIcon = () => (
  <svg width="20" height="20" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="28" height="28" rx="14" fill="#3B99FC"/>
    <path d="M8.18 11.3C11.4 8.1 16.6 8.1 19.82 11.3l.4.39c.16.16.16.42 0 .58l-1.26 1.24a.21.21 0 01-.29 0l-.55-.54a5.58 5.58 0 00-7.8 0l-.59.58a.21.21 0 01-.29 0L8.2 11.88a.41.41 0 010-.58zm11.8 2.54 1.12 1.1c.16.16.16.42 0 .58l-5.08 4.98a.42.42 0 01-.58 0L12 17.06a.1.1 0 00-.15 0l-3.46 3.44a.42.42 0 01-.58 0L2.74 15.52a.41.41 0 010-.58l1.12-1.1c.16-.16.42-.16.58 0l3.46 3.44c.04.04.11.04.15 0l3.46-3.44c.16-.16.42-.16.58 0l3.46 3.44c.04.04.11.04.15 0l3.46-3.44c.16-.16.42-.16.58 0z" fill="white"/>
  </svg>
);

const walletButtonClass = "w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-start gap-3 border border-white/10 px-4";

export type WalletId = 'metamask' | 'phantom' | 'trust';

/** A wallet found on this machine that isn't one of the three named buttons. */
export interface DiscoveredWallet {
  /** wagmi connector id — also what gets passed back to connect with. */
  id: string;
  name: string;
  /** The extension's own icon, as announced over EIP-6963. */
  icon?: string;
}

interface LoginWalletsStepProps {
  isConnecting: boolean;
  activeProvider: string | null;
  /** Everything else installed here, discovered rather than hardcoded. */
  discoveredWallets?: DiscoveredWallet[];
  onWalletConnect: (wallet: WalletId, connect: () => void) => void;
  onDiscoveredWalletConnect?: (connectorId: string) => void;
  onWalletConnectConnect: (connect: () => void) => void;
  /** Phone sheet: importing a key lives here, under the one Wallet button. */
  onImportWallet?: () => void;
}

export function LoginWalletsStep({
  isConnecting,
  activeProvider,
  discoveredWallets = [],
  onWalletConnect,
  onDiscoveredWalletConnect,
  onWalletConnectConnect,
  onImportWallet,
}: LoginWalletsStepProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();

  // The curated connectors are not in the boot config (lib/wagmi-wallets):
  // WalletButton throws "Connector not found" for a wallet that is missing,
  // so the rows wait for them, holding their space blank (no grey pills).
  const [connectorsReady, setConnectorsReady] = useState(false);
  const [connectorError, setConnectorError] = useState(false);
  const [connectorAttempt, setConnectorAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setConnectorError(false);
    import('@/lib/wagmi-wallets').then((m) => {
      m.ensureWalletConnectors();
      if (alive) setConnectorsReady(true);
    }).catch(() => {
      if (alive) setConnectorError(true);
    });
    return () => {
      alive = false;
    };
  }, [connectorAttempt]);

  if (connectorError) {
    return (
      <div className="space-y-3 py-4" role="alert">
        <p className="text-sm text-white/70 text-center">
          {t('loginModal.walletLoadFailed', 'Could not load wallets. Please try again.')}
        </p>
        <Button className={walletButtonClass} onClick={() => setConnectorAttempt(n => n + 1)}>
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    );
  }

  if (!connectorsReady) {
    return (
      <div className="space-y-3 invisible" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-full h-12" />
        ))}
      </div>
    );
  }

  return (
    <RainbowKitProvider theme={darkTheme()} modalSize="compact">
      <div className="space-y-3">
        <WalletButton.Custom wallet="metamask">
          {({ mounted, connect }) => (
            <Button
              disabled={isConnecting || !mounted}
              onClick={() => onWalletConnect('metamask', connect)}
              className={walletButtonClass}
            >
              {activeProvider === 'metamask' && isConnecting ? (
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              ) : (
                <div className="flex-shrink-0"><MetaMaskIcon /></div>
              )}
              <span className="flex-1 text-left">MetaMask</span>
              <ChevronRight className="w-4 h-4 text-white/40" />
            </Button>
          )}
        </WalletButton.Custom>

        <WalletButton.Custom wallet="phantom">
          {({ mounted, connect }) => (
            <Button
              disabled={isConnecting || !mounted}
              onClick={() => onWalletConnect('phantom', connect)}
              className={walletButtonClass}
            >
              {activeProvider === 'phantom' && isConnecting ? (
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              ) : (
                <div className="flex-shrink-0"><PhantomIcon /></div>
              )}
              <span className="flex-1 text-left">{_copy("copy.08b6a3efc2b5", { defaultValue: "Phantom" })}</span>
              <ChevronRight className="w-4 h-4 text-white/40" />
            </Button>
          )}
        </WalletButton.Custom>

        <WalletButton.Custom wallet={isMobileDevice() && !isWalletInAppBrowser() ? "walletconnect" : "trust"}>
          {({ mounted, connect }) => (
            <Button
              disabled={isConnecting || !mounted}
              onClick={() => onWalletConnect('trust', connect)}
              className={walletButtonClass}
            >
              {activeProvider === 'trust' && isConnecting ? (
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              ) : (
                <div className="flex-shrink-0"><TrustIcon /></div>
              )}
              <span className="flex-1 text-left">{_copy("copy.2ef54eee0edd", { defaultValue: "Trust Wallet" })}</span>
              <ChevronRight className="w-4 h-4 text-white/40" />
            </Button>
          )}
        </WalletButton.Custom>

        {/*
          Everything else this browser announced over EIP-6963. wagmi has been
          discovering these all along — the sheet simply threw them away and
          offered three names, so a Rabby or Coinbase user had to know that
          "MetaMask" would sometimes reach their wallet and sometimes reach
          whichever extension won the injection race.
        */}
        {discoveredWallets.map((wallet) => (
          <div key={wallet.id} className="space-y-3">
            <Button
              disabled={isConnecting}
              onClick={() => onDiscoveredWalletConnect?.(wallet.id)}
              className={walletButtonClass}
            >
              {activeProvider === wallet.id && isConnecting ? (
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              ) : wallet.icon ? (
                <img
                  src={wallet.icon}
                  width="20"
                  height="20"
                  alt=""
                  className="flex-shrink-0 rounded-full object-contain"
                />
              ) : (
                <div className="w-5 h-5 flex-shrink-0 rounded-full bg-white/10" />
              )}
              <span className="flex-1 text-left truncate">{wallet.name}</span>
              <ChevronRight className="w-4 h-4 text-white/40" />
            </Button>
          </div>
        ))}

        <WalletButton.Custom wallet="walletconnect">
          {({ connect }) => (
            <Button
              disabled={isConnecting}
              onClick={() => onWalletConnectConnect(connect)}
              className={walletButtonClass}
            >
              {activeProvider === 'walletconnect' && isConnecting ? (
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              ) : (
                <div className="flex-shrink-0"><WalletConnectIcon /></div>
              )}
              <span className="flex-1 text-left">WalletConnect</span>
              <ChevronRight className="w-4 h-4 text-white/40" />
            </Button>
          )}
        </WalletButton.Custom>

        {onImportWallet && (
          <Button
            disabled={isConnecting}
            onClick={onImportWallet}
            className={walletButtonClass}
          >
            <KeyRound className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 text-left">{_copy('copy.a865110e919b', { defaultValue: 'Import wallet' })}</span>
            <ChevronRight className="w-4 h-4 text-white/40" />
          </Button>
        )}

        <p className="text-white/40 text-[10px] text-center mt-2 px-2">
          {isMobileDevice()
            ? t('loginModal.walletInfoMobile')
            : t('loginModal.walletInfoDesktop')}
        </p>
      </div>
    </RainbowKitProvider>
  );
}

export default LoginWalletsStep;
