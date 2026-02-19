/**
 * Custom Login Modal Component
 * ============================
 * Fully branded login experience.
 * Social logins via Web3Auth, wallet connections via standard Wagmi.
 * Removed Reown AppKit to stabilize the connection experience.
 */

import React, { useState, useEffect } from 'react';
import { Mail, Wallet, Loader2, ChevronRight, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { WalletButton } from '@rainbow-me/rainbowkit';
import dehubLogo from '@/assets/dehub-logo-white.png';

// Social provider icons
// Social provider icons
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const XIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" className="fill-white">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const MetaMaskIcon = () => (
  <img 
    src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Alpha_Color.svg" 
    width="20" 
    height="20" 
    alt="MetaMask" 
  />
);


interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LoginStep = 'main' | 'email' | 'sms' | 'wallets';

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const { connectWithProvider, connectWithEmail, connectWithSMS, setWagmiAuthIntent, isConnecting } = useAuth();
  const [step, setStep] = useState<LoginStep>('main');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

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

  const handleWalletConnect = (wallet: 'metamask' | 'phantom', connect: () => void) => {
    setActiveProvider(wallet);
    setWagmiAuthIntent(true);
    connect();
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
  
  const PhantomIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="20" height="20">
      <path fill="#AB9FF2" d="M109.8 15.6C102.3 8.3 92.7 4.5 82.2 4.5h-5.7l-4.2 1.1C64 12.8 45.6 28.6 34.6 47.9c-4.9 8.5-8.4 17.6-10.4 27.2l-.3 1.5c-2.7-.3-5.5-.6-8.3-.9-2.7-.3-5.5-.4-8.2-.4-7.4 0-14.1.9-20.2 2.7l-1.1.3-.3 1.1C-3.3 92.7-5.1 106.3-5 119.9c0 4.1 3.4 7.5 7.5 7.6h.2c1.9 0 3.8-.7 5.1-2l.7-.7c4.3-4.2 9.8-6.9 15.8-7.6 13.4-1.8 15.2 1.3 16.2 3 2.4 4 6.3 7.6 10.2 7.6h.2c1.9 0 3.7-.7 5.1-2l.7-.7c4.3-4.1 9.8-6.8 15.7-7.6 13.6-1.8 15.2 1.5 16.2 3.2 2.3 4 6.4 7.5 9.9 7.1h.2c1.9 0 3.7-.7 5.1-2l.7-.7c4.3-4.1 9.8-6.8 15.7-7.6 9.9-1.3 14.1-.9 16.5 1.9l1 1.1 1.4-.5c6.7-2.4 11.4-8.2 12.5-15.2 1.2-8.3-3.1-16.4-10.6-20.3l-1.3-.7v-1.5c0-23.9-7.5-46-21.7-64l-.9-1.1z"/>
      <path fill="#FFF" d="M98.4 54.3c-4.4 0-8.1 3.7-8.1 8.1s3.7 8.1 8.1 8.1 8.1-3.7 8.1-8.1-3.7-8.1-8.1-8.1zM64.2 54.3c-4.4 0-8.1 3.7-8.1 8.1s3.7 8.1 8.1 8.1 8.1-3.7 8.1-8.1-3.7-8.1-8.1-8.1z"/>
    </svg>
  );

  const walletButtonClass = "w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-start gap-3 border border-white/10 px-4";

  const renderWalletsStep = () => (
    <div className="space-y-3">
      <WalletButton.Custom wallet="metamask">
        {({ ready, connect }) => (
          <Button
            disabled={!ready || isConnecting}
            onClick={() => handleWalletConnect('metamask', connect)}
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
        {({ ready, connect }) => (
          <Button
            disabled={!ready || isConnecting}
            onClick={() => handleWalletConnect('phantom', connect)}
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

      <p className="text-white/40 text-[10px] text-center mt-2 px-2">
        On mobile, your wallet app will open to sign in and return here automatically
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
