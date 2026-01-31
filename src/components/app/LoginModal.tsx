/**
 * Custom Login Modal Component
 * ============================
 * Fully branded login experience without Web3Auth/MetaMask branding.
 * Uses connectTo() for direct provider connections.
 */

import { useState } from 'react';
import { X, Mail, Wallet, Loader2, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import dehubLogo from '@/assets/dehub-logo-white.png';

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

const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#26A5E4]">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
  </svg>
);

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LoginStep = 'main' | 'email' | 'wallets';

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const { connectWithProvider, connectWithEmail, connectWithWallet, isConnecting } = useAuth();
  const [step, setStep] = useState<LoginStep>('main');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  const handleClose = () => {
    if (!isConnecting) {
      setStep('main');
      setEmail('');
      setEmailError('');
      setActiveProvider(null);
      onOpenChange(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'twitter' | 'telegram' | 'apple') => {
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

  const handleWalletConnect = async (wallet: 'metamask' | 'walletconnect' | 'coinbase') => {
    setActiveProvider(wallet);
    try {
      await connectWithWallet(wallet);
      handleClose();
    } catch (error) {
      console.error(`${wallet} login failed:`, error);
      setActiveProvider(null);
    }
  };

  const renderMainStep = () => (
    <div className="space-y-4">
      {/* Social logins */}
      <div className="space-y-3">
        <Button
          onClick={() => handleSocialLogin('google')}
          disabled={isConnecting}
          className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-3 border border-zinc-700"
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
          className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-3 border border-zinc-700"
        >
          {activeProvider === 'twitter' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <XIcon />
          )}
          <span>Continue with X</span>
        </Button>

        <Button
          onClick={() => handleSocialLogin('telegram')}
          disabled={isConnecting}
          className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-3 border border-zinc-700"
        >
          {activeProvider === 'telegram' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <TelegramIcon />
          )}
          <span>Continue with Telegram</span>
        </Button>

        <Button
          onClick={() => handleSocialLogin('apple')}
          disabled={isConnecting}
          className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-3 border border-zinc-700"
        >
          {activeProvider === 'apple' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <AppleIcon />
          )}
          <span>Continue with Apple</span>
        </Button>
      </div>

      <div className="flex items-center gap-3 py-2">
        <Separator className="flex-1 bg-zinc-700" />
        <span className="text-zinc-500 text-sm">or</span>
        <Separator className="flex-1 bg-zinc-700" />
      </div>

      {/* Email & Wallet options */}
      <div className="space-y-3">
        <Button
          onClick={() => setStep('email')}
          disabled={isConnecting}
          variant="outline"
          className="w-full h-12 bg-transparent hover:bg-zinc-800 text-white rounded-xl flex items-center justify-between border-zinc-700"
        >
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5" />
            <span>Continue with Email</span>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        </Button>

        <Button
          onClick={() => setStep('wallets')}
          disabled={isConnecting}
          variant="outline"
          className="w-full h-12 bg-transparent hover:bg-zinc-800 text-white rounded-xl flex items-center justify-between border-zinc-700"
        >
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5" />
            <span>Connect Wallet</span>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        </Button>
      </div>
    </div>
  );

  const renderEmailStep = () => (
    <div className="space-y-4">
      <button
        onClick={() => setStep('main')}
        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back
      </button>

      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isConnecting}
            className="h-12 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
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

        <p className="text-zinc-500 text-xs text-center">
          We'll send you a magic link to sign in
        </p>
      </form>
    </div>
  );

  const renderWalletsStep = () => (
    <div className="space-y-4">
      <button
        onClick={() => setStep('main')}
        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back
      </button>

      <div className="space-y-3">
        <Button
          onClick={() => handleWalletConnect('metamask')}
          disabled={isConnecting}
          className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-3 border border-zinc-700"
        >
          {activeProvider === 'metamask' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" 
              alt="MetaMask" 
              className="w-5 h-5"
            />
          )}
          <span>MetaMask</span>
        </Button>

        <Button
          onClick={() => handleWalletConnect('walletconnect')}
          disabled={isConnecting}
          className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-3 border border-zinc-700"
        >
          {activeProvider === 'walletconnect' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <img 
              src="https://walletconnect.com/static/favicon.ico" 
              alt="WalletConnect" 
              className="w-5 h-5"
            />
          )}
          <span>WalletConnect</span>
        </Button>

        <Button
          onClick={() => handleWalletConnect('coinbase')}
          disabled={isConnecting}
          className="w-full h-12 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-3 border border-zinc-700"
        >
          {activeProvider === 'coinbase' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <img 
              src="https://www.coinbase.com/favicon.ico" 
              alt="Coinbase" 
              className="w-5 h-5"
            />
          )}
          <span>Coinbase Wallet</span>
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm p-0 gap-0 rounded-2xl overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={dehubLogo} alt="DeHub" className="h-8" />
            </div>
            <button
              onClick={handleClose}
              disabled={isConnecting}
              className="p-2 rounded-xl hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <DialogTitle className="text-xl font-bold text-white mt-4">
            {step === 'main' && 'Log in to DeHub'}
            {step === 'email' && 'Continue with Email'}
            {step === 'wallets' && 'Connect Wallet'}
          </DialogTitle>
          {step === 'main' && (
            <p className="text-zinc-400 text-sm mt-1">
              Choose how you want to connect
            </p>
          )}
        </DialogHeader>

        {/* Content */}
        <div className="px-6 pb-6">
          {step === 'main' && renderMainStep()}
          {step === 'email' && renderEmailStep()}
          {step === 'wallets' && renderWalletsStep()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 text-center">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LoginModal;
