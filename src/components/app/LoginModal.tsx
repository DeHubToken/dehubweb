/**
 * Custom Login Modal Component
 * ============================
 * Fully branded login experience.
 * Social logins via Web3Auth, wallet connections via wagmi injected connector.
 * Mobile: WalletConnect deep links - wallet opens for signing, user returns to Chrome.
 */

import React, { useState, useMemo } from 'react';
import { X, Mail, Wallet, Loader2, ChevronRight, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { isMobileDevice } from '@/lib/web3auth';
import { useAppKit } from '@reown/appkit/react';
import dehubLogo from '@/assets/dehub-logo-white.png';

// Social provider icons
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

// Wallet icons
const MetaMaskIcon = () => (
  <svg viewBox="0 0 35 33" className="w-5 h-5">
    <path fill="#E17726" d="M32.958 1l-13.134 9.718 2.442-5.727z"/>
    <path fill="#E27625" d="M2.663 1l13.017 9.809-2.325-5.818zM28.229 23.533l-3.495 5.339 7.483 2.06 2.143-7.282zM.814 23.65l2.134 7.282 7.475-2.06-3.495-5.339z"/>
    <path fill="#E27625" d="M10.071 14.514l-2.076 3.132 7.405.337-.247-7.969zM25.55 14.514l-5.2-4.591-.17 8.06 7.405-.337zM10.423 28.872l4.467-2.163-3.857-3.008zM20.73 26.709l4.467 2.163-.61-5.171z"/>
    <path fill="#D5BFB2" d="M25.197 28.872l-4.467-2.163.357 2.905-.038 1.224zM10.423 28.872l4.148 1.966-.03-1.224.349-2.905z"/>
    <path fill="#233447" d="M14.647 21.576l-3.72-1.092 2.626-1.205zM20.974 21.576l1.094-2.297 2.634 1.205z"/>
    <path fill="#CC6228" d="M10.423 28.872l.636-5.339-4.131.117zM24.56 23.533l.637 5.339 3.495-5.222zM27.626 17.646l-7.405.337.688 3.593 1.094-2.297 2.634 1.205zM10.927 20.484l2.626-1.205 1.094 2.297.688-3.593-7.405-.337z"/>
    <path fill="#E27625" d="M7.93 17.646l3.113 6.064-.107-3.226zM24.702 20.484l-.114 3.226 3.12-6.064zM15.335 17.983l-.688 3.593.866 4.474.195-5.892zM20.22 17.983l-.357 2.166.178 5.901.874-4.474z"/>
    <path fill="#F5841F" d="M20.909 21.576l-.874 4.474.627.443 3.857-3.008.114-3.226zM10.927 20.484l.107 3.226 3.857 3.008.627-.443-.866-4.474z"/>
    <path fill="#C0AC9D" d="M20.985 30.838l.038-1.224-.336-.289H14.933l-.32.29.03 1.223-4.148-1.966 1.45 1.187 2.94 2.034h5.852l2.948-2.034 1.45-1.187z"/>
    <path fill="#161616" d="M20.73 26.709l-.627-.443h-4.586l-.627.443-.349 2.905.32-.289h5.754l.336.29z"/>
    <path fill="#763E1A" d="M33.517 11.353l1.114-5.36L32.958 1l-12.228 9.073 4.703 3.975 6.643 1.937 1.467-1.71-.637-.461 1.014-.923-.788-.604 1.015-.773z"/>
    <path fill="#763E1A" d="M.386 5.993l1.122 5.36-.718.533 1.015.773-.788.604 1.014.923-.637.46 1.467 1.711 6.643-1.937 4.703-3.975L2.663 1z"/>
    <path fill="#F5841F" d="M32.049 16.025l-6.643-1.937 2.077 3.132-3.12 6.064 4.131-.053h6.165zM10.071 14.088l-6.643 1.937-2.214 7.196h6.157l4.131.053-3.113-6.064zM20.22 17.983l.425-7.352 1.935-5.227H13.04l1.926 5.227.434 7.352.166 2.184.008 5.883h4.586l.017-5.883z"/>
  </svg>
);

const TrustWalletIcon = () => (
  <svg viewBox="0 0 40 40" className="w-5 h-5">
    <path fill="#3375BB" d="M20 4.5c-1.5 0-9.5 5.5-12 7v.5c0 8.5 5 16.5 12 20 7-3.5 12-11.5 12-20v-.5c-2.5-1.5-10.5-7-12-7z"/>
    <path fill="#fff" d="M20 7c-1.2 0-7.8 4.4-9.8 5.7v.4c0 7 4.1 13.5 9.8 16.4 5.7-2.9 9.8-9.4 9.8-16.4v-.4C27.8 11.4 21.2 7 20 7z"/>
    <path fill="#3375BB" d="M20 10.5c-.8 0-5.5 3.2-7 4.1v.3c0 5 2.9 9.7 7 11.8 4.1-2.1 7-6.8 7-11.8v-.3c-1.5-.9-6.2-4.1-7-4.1z"/>
  </svg>
);

const PhantomIcon = () => (
  <svg viewBox="0 0 128 128" className="w-5 h-5">
    <rect fill="#AB9FF2" rx="26" width="128" height="128"/>
    <path fill="#fff" d="M108.1 62.5c-2 20.2-17.7 38.5-43.4 38.5H43.8c-2.3 0-4.1-2-3.8-4.3l8.1-55.9c.2-1.6 1.6-2.8 3.2-2.8h24.3c18.8 0 33.8 12.2 32.5 24.5zM71 57.5c0-3.3-2.7-6-6-6s-6 2.7-6 6 2.7 6 6 6 6-2.7 6-6zm17 0c0-3.3-2.7-6-6-6s-6 2.7-6 6 2.7 6 6 6 6-2.7 6-6z"/>
  </svg>
);

const CoinbaseIcon = () => (
  <svg viewBox="0 0 48 48" className="w-5 h-5">
    <circle fill="#0052FF" cx="24" cy="24" r="24"/>
    <path fill="#fff" d="M24 8c-8.837 0-16 7.163-16 16s7.163 16 16 16 16-7.163 16-16S32.837 8 24 8zm-4 20a4 4 0 010-8h8a4 4 0 010 8h-8z"/>
  </svg>
);

// WalletConnect icon SVG (used inline in the wallets step)

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

  const isMobile = useMemo(() => isMobileDevice(), []);
  const hasInjectedWallet = useMemo(() => typeof window !== 'undefined' && !!(window as any).ethereum, []);

  const handleClose = () => {
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

  // Connect using wagmi injected connector (for browser extensions / in-app browsers)
  const handleInjectedConnect = async () => {
    setActiveProvider('injected');
    try {
      await connectWithWallet('metamask'); // Uses injected connector internally
      handleClose();
    } catch (error) {
      console.error('Wallet connection failed:', error);
      setActiveProvider(null);
    }
  };

  // Connect using WalletConnect (via Reown AppKit)
  const { open: openAppKit } = useAppKit();

  const handleWalletConnect = async () => {
    setActiveProvider('walletconnect');
    onOpenChange(false); // Close our modal - AppKit shows its own modal
    try {
      console.log('[LoginModal] Opening Reown AppKit...');
      await openAppKit();
      // Auth continues in AuthContext useEffect when isWagmiConnected changes
    } catch (error) {
      console.error('AppKit failed:', error);
      setActiveProvider(null);
      onOpenChange(true); // Reopen our modal on error
    }
  };

  const renderMainStep = () => (
    <div className="space-y-4">
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

  const renderWalletsStep = () => (
    <div className="space-y-3">
      {/* Mobile: In wallet in-app browser - direct connect */}
      {isMobile && hasInjectedWallet && (
        <Button
          onClick={handleInjectedConnect}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center gap-3 border border-white/10 px-4"
        >
          {activeProvider === 'injected' ? (
            <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
          ) : (
            <Wallet className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="flex-1 text-left">Connect Wallet</span>
          <ChevronRight className="w-4 h-4 text-white/40" />
        </Button>
      )}

      {/* WalletConnect - QR code on desktop, wallet selection modal on mobile */}
      <Button
        onClick={handleWalletConnect}
        disabled={isConnecting}
        className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center gap-3 border border-white/10 px-4"
      >
        {activeProvider === 'walletconnect' ? (
          <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
        ) : (
          <svg viewBox="0 0 300 185" className="w-5 h-5 flex-shrink-0">
            <path fill="#3B99FC" d="M61.4 36.3c49.1-48.1 128.6-48.1 177.7 0l5.9 5.8c2.5 2.4 2.5 6.3 0 8.7l-20.2 19.8c-1.2 1.2-3.2 1.2-4.4 0l-8.1-8c-34.2-33.5-89.7-33.5-124 0l-8.7 8.5c-1.2 1.2-3.2 1.2-4.4 0L55 51.3c-2.5-2.4-2.5-6.3 0-8.7l6.4-6.3zm219.6 41l18 17.6c2.5 2.4 2.5 6.3 0 8.7l-81.1 79.4c-2.5 2.4-6.4 2.4-8.9 0l-57.5-56.4c-.6-.6-1.6-.6-2.2 0L92.7 182.9c-2.5 2.4-6.4 2.4-8.9 0L2.8 103.5c-2.5-2.4-2.5-6.3 0-8.7l18-17.6c2.5-2.4 6.4-2.4 8.9 0l57.5 56.4c.6.6 1.6.6 2.2 0l57.5-56.4c2.5-2.4 6.4-2.4 8.9 0l57.5 56.4c.6.6 1.6.6 2.2 0l57.5-56.4c2.5-2.4 6.5-2.4 9 0z"/>
          </svg>
        )}
        <span className="flex-1 text-left">WalletConnect</span>
        <ChevronRight className="w-4 h-4 text-white/40" />
      </Button>
      <p className="text-white/40 text-xs text-center pt-1">
        {isMobile
          ? 'Choose your wallet, approve & return here'
          : 'Connect via WalletConnect or scan QR code'}
      </p>
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
