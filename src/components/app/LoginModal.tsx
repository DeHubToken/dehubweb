/**
 * Custom Login Modal Component
 * ============================
 * Fully branded login experience.
 * Social logins via Web3Auth, wallet connections via Reown AppKit.
 * AppKit handles all wallets (injected, WalletConnect, etc.) on both desktop and mobile.
 */

import React, { useState, useEffect } from 'react';
import { X, Mail, Wallet, Loader2, ChevronRight, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
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


interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LoginStep = 'main' | 'email' | 'sms' | 'wallets';

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const { connectWithProvider, connectWithEmail, connectWithSMS, isConnecting } = useAuth();
  const [step, setStep] = useState<LoginStep>('main');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const { open: openAppKit } = useAppKit();
  const { setWagmiAuthIntent } = useAuth();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  // Open Reown AppKit modal - handles all wallets (injected, WalletConnect, etc.)
  const handleWalletConnect = async () => {
    setActiveProvider('walletconnect');
    try {
      console.log('[LoginModal] Opening WalletConnect (AppKit)...');
      setWagmiAuthIntent(true);
      
      // Call open BEFORE closing our modal to avoid unmount issues
      await openAppKit();
      
      // Close our modal after a slight delay or once AppKit is likely visible
      setTimeout(() => onOpenChange(false), 500);
      
      // Auth continues in AuthContext useEffect when isWagmiConnected changes
    } catch (error) {
      console.error('WalletConnect failed:', error);
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
    <div className="space-y-4">
      <Button
        onClick={handleWalletConnect}
        disabled={isConnecting}
        className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10 px-4"
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
      <p className="text-white/40 text-xs text-center">
        Connect via WalletConnect or scan QR code
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
              Sending link...
            </span>
          ) : (
            'Continue'
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          We'll send you a magic link to sign in
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
              Sending code...
            </span>
          ) : (
            'Continue'
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          We'll send you a verification code via SMS
        </p>
      </form>
    </div>
  );

  const headerContent = (
    <>
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
    </>
  );

  const titleText = step === 'main' ? 'Log in'
    : step === 'email' ? 'Continue with Email'
    : step === 'sms' ? 'Continue with SMS'
    : 'Connect Wallet';

  const bodyContent = (
    <>
      <div className="px-6 pb-6">
        {step === 'main' && renderMainStep()}
        {step === 'email' && renderEmailStep()}
        {step === 'sms' && renderSMSStep()}
        {step === 'wallets' && renderWalletsStep()}
      </div>
      <div className="px-6 py-4 bg-black/20 border-t border-white/10">
        <p className="text-xs text-white/40 text-center">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleClose}>
        <DrawerContent className="bg-black/60 backdrop-blur-2xl saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden">
          <DrawerHeader className="px-6 pt-6 pb-4">
            {headerContent}
            <DrawerTitle className="text-base font-medium text-white mt-4 text-center">
              {titleText}
            </DrawerTitle>
          </DrawerHeader>
          {bodyContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-black/40 backdrop-blur-2xl saturate-[180%] border border-white/10 max-w-sm p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          {headerContent}
          <DialogTitle className="text-base font-medium text-white mt-4 text-center">
            {titleText}
          </DialogTitle>
        </DialogHeader>
        {bodyContent}
      </DialogContent>
    </Dialog>
  );
}

export default LoginModal;
