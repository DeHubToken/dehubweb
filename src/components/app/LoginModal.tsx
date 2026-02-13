/**
 * Custom Login Modal Component
 * ============================
 * Fully branded login experience without Web3Auth/MetaMask branding.
 * Uses connectTo() for direct provider connections.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { X, Mail, Wallet, Loader2, ChevronRight, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { isMobileDevice } from '@/lib/web3auth';
import dehubLogo from '@/assets/dehub-logo-white.png';
import phantomLogo from '@/assets/icons/phantom-logo.png';
import rabbyLogo from '@/assets/icons/rabby-logo.png';

// Social provider icons as SVG components
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

// Wallet icons as SVG components
const MetaMaskIcon = () => (
  <svg viewBox="0 0 35 33" className="w-5 h-5">
    <path fill="#E17726" d="M32.958 1l-13.134 9.718 2.442-5.727z"/>
    <path fill="#E27625" d="M2.663 1l13.017 9.809-2.325-5.818zM28.229 23.533l-3.495 5.339 7.483 2.06 2.143-7.282zM.638 23.65l2.13 7.282 7.47-2.06-3.481-5.339z"/>
    <path fill="#E27625" d="M9.875 14.471l-2.079 3.14 7.405.337-.247-7.969zM25.746 14.471l-5.158-4.587-.169 8.064 7.405-.337zM10.238 28.872l4.486-2.18-3.876-3.024zM20.897 26.692l4.472 2.18-.596-5.204z"/>
    <path fill="#D5BFB2" d="M25.369 28.872l-4.472-2.18.364 2.903-.039 1.231zM10.238 28.872l4.147 1.954-.026-1.231.351-2.903z"/>
    <path fill="#233447" d="M14.463 21.607l-3.733-1.1 2.636-1.205zM21.158 21.607l1.097-2.305 2.649 1.205z"/>
    <path fill="#CC6228" d="M10.238 28.872l.611-5.339-4.092.117zM24.758 23.533l.611 5.339 3.481-5.222zM27.825 17.611l-7.405.337.689 3.659 1.097-2.305 2.649 1.205zM10.73 20.507l2.636-1.205 1.097 2.305.689-3.659-7.405-.337z"/>
    <path fill="#E27625" d="M7.747 17.611l3.12 6.083-.104-3.029zM24.904 20.665l-.117 3.029 3.133-6.083zM15.152 17.948l-.689 3.659.871 4.496.195-5.926zM20.42 17.948l-.364 2.216.169 5.939.884-4.496z"/>
    <path fill="#F5841F" d="M21.109 21.607l-.884 4.496.637.449 3.876-3.024.117-3.029zM10.73 20.507l.104 3.029 3.876 3.024.637-.449-.884-4.496z"/>
    <path fill="#C0AC9D" d="M21.187 30.826l.039-1.231-.338-.286h-4.957l-.325.286.026 1.231-4.147-1.954 1.449 1.192 2.948 2.033h5.048l2.961-2.033 1.449-1.192z"/>
    <path fill="#161616" d="M20.897 26.692l-.637-.449h-3.699l-.637.449-.351 2.903.325-.286h4.957l.338.286z"/>
    <path fill="#763E1A" d="M33.517 11.353l1.114-5.364L32.958 1l-12.061 8.966 4.64 3.924 6.56 1.914 1.449-1.688-.631-.455 1.001-.914-.767-.597 1.001-.767zM.99 5.989l1.127 5.364-.72.539 1.001.767-.767.597 1.001.914-.631.455 1.449 1.688 6.56-1.914 4.64-3.924L2.663 1z"/>
    <path fill="#F5841F" d="M32.049 15.84l-6.56-1.914 1.98 3.14-2.948 5.705 3.889-.052h5.809zM9.875 13.926l-6.56 1.914-2.182 7.81h5.796l3.889.052-2.948-5.705zM20.42 17.948l.416-7.234 1.902-5.141h-8.436l1.889 5.141.429 7.234.156 2.229.013 5.913h3.699l.026-5.913z"/>
  </svg>
);

const WalletConnectIcon = () => (
  <svg viewBox="0 0 300 185" className="w-5 h-5">
    <path fill="#3B99FC" d="M61.439 36.256c48.91-47.888 128.212-47.888 177.123 0l5.886 5.764a6.041 6.041 0 0 1 0 8.67l-20.136 19.716a3.179 3.179 0 0 1-4.428 0l-8.101-7.931c-34.122-33.408-89.444-33.408-123.566 0l-8.675 8.494a3.179 3.179 0 0 1-4.428 0L54.978 51.253a6.041 6.041 0 0 1 0-8.67l6.461-6.327zM280.206 77.03l17.922 17.547a6.041 6.041 0 0 1 0 8.67l-80.81 79.122a6.357 6.357 0 0 1-8.856 0l-57.354-56.155a1.59 1.59 0 0 0-2.214 0L91.54 182.369a6.357 6.357 0 0 1-8.856 0L1.872 103.247a6.041 6.041 0 0 1 0-8.67l17.922-17.547a6.357 6.357 0 0 1 8.856 0l57.354 56.155a1.59 1.59 0 0 0 2.214 0l57.354-56.155a6.357 6.357 0 0 1 8.856 0l57.354 56.155a1.59 1.59 0 0 0 2.214 0l57.354-56.155a6.357 6.357 0 0 1 8.856 0z"/>
  </svg>
);

const PhantomIcon = () => (
  <img src={phantomLogo} alt="Phantom" className="w-5 h-5 rounded-md" />
);

const RabbyIcon = () => (
  <img src={rabbyLogo} alt="Rabby" className="w-5 h-5 rounded-full" />
);

const TrustWalletIcon = () => (
  <svg viewBox="0 0 32 32" className="w-5 h-5">
    <defs>
      <linearGradient id="trustGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0500FF" />
        <stop offset="100%" stopColor="#00D9B8" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="16" fill="url(#trustGradient)"/>
    <path fill="#fff" d="M16 7c-2.5 0-6 1.8-6 1.8v7.7c0 4 6 7.5 6 7.5s6-3.5 6-7.5V8.8S18.5 7 16 7zm4 9.5c0 2.8-4 5.2-4 5.2s-4-2.4-4-5.2v-5.8s2.5-1.2 4-1.2 4 1.2 4 1.2v5.8z"/>
  </svg>
);

const CoinbaseIcon = () => (
  <svg viewBox="0 0 32 32" className="w-5 h-5">
    <circle cx="16" cy="16" r="16" fill="#0052FF"/>
    <path fill="#fff" d="M16 6C10.5 6 6 10.5 6 16s4.5 10 10 10 10-4.5 10-10S21.5 6 16 6zm0 15c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z"/>
  </svg>
);

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LoginStep = 'main' | 'email' | 'sms' | 'wallets';

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const { connectWithProvider, connectWithEmail, connectWithSMS, connectWithWallet, isConnecting } = useAuth();
  const [step, setStep] = useState<LoginStep>('main');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  
  // Memoize mobile detection to avoid recalculating on every render
  const isMobile = useMemo(() => isMobileDevice(), []);

  // Preload wallet icon images so they appear simultaneously with SVG icons
  const [walletIconsReady, setWalletIconsReady] = useState(false);
  useEffect(() => {
    if (!open) {
      setWalletIconsReady(false);
      return;
    }
    const sources = [phantomLogo, rabbyLogo];
    let loaded = 0;
    const onLoad = () => {
      loaded++;
      if (loaded >= sources.length) setWalletIconsReady(true);
    };
    sources.forEach(src => {
      const img = new Image();
      img.onload = onLoad;
      img.onerror = onLoad; // don't block on failure
      img.src = src;
    });
  }, [open]);

  const handleClose = () => {
    // Always allow closing - user should never be trapped
    setStep('main');
    setEmail('');
    setPhone('');
    setEmailError('');
    setPhoneError('');
    setActiveProvider(null);
    onOpenChange(false);
  };

  const handleSocialLogin = async (provider: 'google' | 'twitter') => {
    setActiveProvider(provider);
    try {
      await connectWithProvider(provider);
      handleClose();
    } catch (error) {
      console.error(`${provider} login failed:`, error);
      setActiveProvider(null);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    
    setActiveProvider('email');
    try {
      await connectWithEmail(email);
      handleClose();
    } catch (error) {
      console.error('Email login failed:', error);
      setActiveProvider(null);
    }
  };

  const handleSMSSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError('');
    
    // Basic phone validation (international format)
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    const cleanedPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (!phoneRegex.test(cleanedPhone)) {
      setPhoneError('Please enter a valid phone number with country code');
      return;
    }
    
    setActiveProvider('sms');
    try {
      await connectWithSMS(cleanedPhone);
      handleClose();
    } catch (error) {
      console.error('SMS login failed:', error);
      setActiveProvider(null);
    }
  };

  // Deep link URLs for wallet in-app browsers on mobile
  // When opened, the wallet loads dehub.io in its built-in browser where window.ethereum is available
  const WALLET_DEEP_LINKS: Record<string, string> = {
    metamask: `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`,
    trust: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(window.location.origin)}`,
    phantom: `https://phantom.app/ul/browse/${encodeURIComponent(window.location.origin)}?ref=${encodeURIComponent(window.location.origin)}`,
    coinbase: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(window.location.origin)}`,
  };

  const handleWalletConnect = async (wallet: 'metamask' | 'walletconnect' | 'coinbase' | 'phantom' | 'rabby' | 'trust') => {
    // On mobile: deep link to wallet app's in-app browser (most reliable)
    // The wallet's browser injects window.ethereum so MetaMask adapter works directly
    // If window.ethereum is already present (we are likely already in a wallet's in-app browser),
    // proceed with the normal adapter connection instead of deep linking.
    if (isMobile && !(window as any).ethereum && wallet !== 'walletconnect') {
      const deepLink = WALLET_DEEP_LINKS[wallet] || WALLET_DEEP_LINKS.metamask;
      console.log(`[LoginModal] Mobile deep link to ${wallet}:`, deepLink);
      window.location.href = deepLink;
      return;
    }

    // Desktop: use Web3Auth adapter (window.ethereum available from extensions)
    // WalletConnect: use WalletConnect V2 adapter on both mobile and desktop
    setActiveProvider(wallet);
    onOpenChange(false);
    try {
      await connectWithWallet(wallet);
      setStep('main');
      setActiveProvider(null);
    } catch (error) {
      console.error(`${wallet} login failed:`, error);
      setActiveProvider(null);
      onOpenChange(true);
    }
  };

  const renderMainStep = () => (
    <div className="space-y-4">
      {/* Email first, then social logins */}
      <div className="space-y-3">
        <Button
          onClick={() => setStep('email')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          <Mail className="w-5 h-5" />
          <span>Continue with Email</span>
        </Button>

        <Button
          onClick={() => setStep('sms')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          <Smartphone className="w-5 h-5" />
          <span>Continue with SMS</span>
        </Button>

        <Button
          onClick={() => handleSocialLogin('google')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          {activeProvider === 'google' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          <span>Continue with Google</span>
        </Button>

        <Button
          onClick={() => handleSocialLogin('twitter')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          {activeProvider === 'twitter' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <XIcon />
          )}
          <span>Continue with X</span>
        </Button>
      </div>

      <div className="flex items-center gap-3 py-2">
        <Separator className="flex-1 bg-white/10" />
        <span className="text-white/40 text-sm">or</span>
        <Separator className="flex-1 bg-white/10" />
      </div>

      {/* Wallet option */}
      <Button
        onClick={() => setStep('wallets')}
        disabled={isConnecting}
        variant="outline"
        className="w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl flex items-center justify-center gap-3 border-white/10"
      >
        <Wallet className="w-5 h-5" />
        <span>Connect Wallet</span>
      </Button>
    </div>
  );

  const renderEmailStep = () => (
    <div className="space-y-4">

      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isConnecting}
            className="h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl"
            autoFocus
          />
          {emailError && (
            <p className="text-red-400 text-sm">{emailError}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isConnecting || !email}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {activeProvider === 'email' ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {isMobile ? 'Redirecting...' : 'Sending link...'}
            </span>
          ) : (
            'Continue'
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          {isMobile 
            ? "You'll be redirected to enter a verification code" 
            : "We'll send you a magic link to sign in"}
        </p>
      </form>
    </div>
  );

  const renderSMSStep = () => (
    <div className="space-y-4">

      <form onSubmit={handleSMSSubmit} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="tel"
            placeholder="+1 234 567 8900"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isConnecting}
            className="h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl"
            autoFocus
          />
          {phoneError && (
            <p className="text-red-400 text-sm">{phoneError}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isConnecting || !phone}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {activeProvider === 'sms' ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {isMobile ? 'Redirecting...' : 'Sending code...'}
            </span>
          ) : (
            'Continue'
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          {isMobile 
            ? "You'll be redirected to enter a verification code" 
            : "We'll send you a verification code via SMS"}
        </p>
      </form>
    </div>
  );

  // Wallet list
  const walletOptions = useMemo(() => {
    const hasInjected = typeof window !== 'undefined' && !!(window as any).ethereum;
    
    const all: { id: 'metamask' | 'walletconnect' | 'coinbase' | 'phantom' | 'rabby' | 'trust'; label: string; mobileLabel: string; Icon: React.FC; desktopOnly?: boolean }[] = [
      { 
        id: 'metamask', 
        label: 'MetaMask', 
        mobileLabel: hasInjected ? 'Connect MetaMask' : 'Open in MetaMask', 
        Icon: MetaMaskIcon 
      },
      { 
        id: 'walletconnect', 
        label: 'WalletConnect', 
        mobileLabel: 'WalletConnect', 
        Icon: WalletConnectIcon 
      },
      { 
        id: 'phantom', 
        label: 'Phantom', 
        mobileLabel: hasInjected ? 'Connect Phantom' : 'Open in Phantom', 
        Icon: PhantomIcon 
      },
      { 
        id: 'trust', 
        label: 'Trust Wallet', 
        mobileLabel: hasInjected ? 'Connect Trust Wallet' : 'Open in Trust Wallet', 
        Icon: TrustWalletIcon 
      },
      { 
        id: 'coinbase', 
        label: 'Coinbase Wallet', 
        mobileLabel: hasInjected ? 'Connect Coinbase' : 'Open in Coinbase', 
        Icon: CoinbaseIcon 
      },
      { 
        id: 'rabby', 
        label: 'Rabby', 
        mobileLabel: 'Rabby', 
        Icon: RabbyIcon, 
        desktopOnly: true 
      },
    ];
    return isMobile ? all.filter(w => !w.desktopOnly) : all;
  }, [isMobile]);

  const renderWalletsStep = () => (
    <div className={`space-y-3 transition-opacity duration-200 ${walletIconsReady ? 'opacity-100' : 'opacity-0'}`}>
      {walletOptions.map(({ id, label, mobileLabel, Icon }) => (
        <Button
          key={id}
          onClick={() => handleWalletConnect(id)}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          {activeProvider === id ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Icon />
          )}
          <span>{isMobile ? mobileLabel : label}</span>
        </Button>
      ))}

      {isMobile && (
        <p className="text-white/40 text-xs text-center pt-1">
          {typeof window !== 'undefined' && !!(window as any).ethereum 
            ? "Log in using your current wallet's browser."
            : "Tapping will open the wallet app. Log in from its built-in browser."}
        </p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-black/40 backdrop-blur-2xl saturate-[180%] border border-white/10 max-w-sm p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-center relative">
            {step !== 'main' && (
              <button
                onClick={() => setStep('main')}
                className="absolute left-0 p-2 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            )}
            <img src={dehubLogo} alt="DeHub" className="h-8" />
            <button
              onClick={handleClose}
              className="absolute right-0 p-2 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white z-[100000]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <DialogTitle className="text-base font-medium text-white mt-4 text-center">
            {step === 'main' && 'Log in'}
            {step === 'email' && 'Continue with Email'}
            {step === 'sms' && 'Continue with SMS'}
            {step === 'wallets' && 'Connect Wallet'}
          </DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div className="px-6 pb-6">
          {step === 'main' && renderMainStep()}
          {step === 'email' && renderEmailStep()}
          {step === 'sms' && renderSMSStep()}
          {step === 'wallets' && renderWalletsStep()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-black/20 border-t border-white/10">
          <p className="text-xs text-white/40 text-center">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LoginModal;
