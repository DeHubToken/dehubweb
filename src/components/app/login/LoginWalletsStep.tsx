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
import { useTranslation } from 'react-i18next';
import { Loader2, ChevronRight } from 'lucide-react';
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

interface LoginWalletsStepProps {
  isConnecting: boolean;
  activeProvider: string | null;
  onWalletConnect: (wallet: WalletId, connect: () => void) => void;
  onWalletConnectConnect: (connect: () => void) => void;
}

export function LoginWalletsStep({
  isConnecting,
  activeProvider,
  onWalletConnect,
  onWalletConnectConnect,
}: LoginWalletsStepProps) {
  const { t } = useTranslation();

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
              <span className="flex-1 text-left">Phantom</span>
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
              <span className="flex-1 text-left">Trust Wallet</span>
              <ChevronRight className="w-4 h-4 text-white/40" />
            </Button>
          )}
        </WalletButton.Custom>

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
