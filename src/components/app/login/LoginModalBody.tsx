/**
 * Everything inside the login sheet below the header.
 *
 * Split out of LoginModal so the sheet itself — the drawer, the backdrop, the
 * header, the terms footer — can ship in the entry bundle and slide up on the
 * same frame as the click, while this (wagmi, the wallet steps, RainbowKit)
 * arrives behind it. See the note at the top of LoginModal.tsx.
 */
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useTranslation } from 'react-i18next';
import { Mail, Phone, Wallet, Loader2 } from 'lucide-react';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { getWalletDeepLink, isMobileDevice, isWalletInAppBrowser } from '@/lib/web3auth';
import type { LoginStep } from './steps';
import type { WalletId } from './LoginWalletsStep';

// The wallet list carries RainbowKit — ~270 KB that has to be evaluated before
// it can render, for a step most people never open. It loads when they do.
const LoginWalletsStep = React.lazy(() =>
  import('./LoginWalletsStep').then(m => ({ default: m.LoginWalletsStep })),
);
// Both wallet-setup steps pull the whole wallet-core stack (mnemonic
// derivation, WebCrypto, the encrypted store, biometrics). Nobody reaches them
// without first completing an identity, and the sheet holds the site loader
// over that gap anyway — so the code arrives during the gap, not before it.
const WalletCreateStep = React.lazy(() =>
  import('@/components/app/wallet-setup/WalletCreateStep').then(m => ({ default: m.WalletCreateStep })),
);
const WalletUnlockStep = React.lazy(() =>
  import('@/components/app/wallet-setup/WalletUnlockStep').then(m => ({ default: m.WalletUnlockStep })),
);

// Social provider icons
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" className="fill-white">
    <path d="M17.05 12.536c-.03-2.087 1.706-3.087 1.783-3.14-.972-1.42-2.484-1.615-3.025-1.638-1.372-.14-2.635.797-3.318.797-.699 0-1.767-.777-2.9-.757-1.49.023-2.865.866-3.626 2.2-1.548 2.685-.397 6.86.98 9.11.677 1.106 1.487 2.346 2.55 2.3.994-.038 1.386-.647 2.6-.647 1.21 0 1.567.647 2.62.63 1.08-.018 1.766-.976 2.44-2.083.775-1.253 1.09-2.487 1.109-2.552-.024-.01-2.19-.844-2.213-3.22zM14.85 5.865c.564-.68.945-1.63.842-2.573-.812.033-1.798.542-2.383 1.222-.522.6-.98 1.567-.857 2.492.902.07 1.827-.457 2.398-1.14z"/>
  </svg>
);

interface LoginModalBodyProps {
  /** Whether the sheet is open — the field reset hangs off this. */
  open: boolean;
  step: LoginStep;
  setStep: (step: LoginStep) => void;
}

export function LoginModalBody({ open, step, setStep }: LoginModalBodyProps) {
  const {
    connectWithProvider, connectWithEmail, cancelEmailMagicLink, verifyEmailOtp, connectWithSMS, verifyPhoneOtp,
    connectWithWallet, completeSmartWalletLogin, setWagmiAuthIntent, isConnecting,
    supabaseUserId, disconnect,
  } = useAuth();
  const { isConnected: isWagmiAlreadyConnected, address: wagmiCurrentAddress } = useAccount();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  // Clear what was typed once the sheet is shut. The step itself is reset by
  // the shell; this is the other half of the old handleClose, and doing it on
  // a closed sheet means nothing flashes on the way out.
  useEffect(() => {
    if (open) return;
    setEmail('');
    setEmailCode('');
    setEmailError('');
    setPhone('');
    setPhoneCode('');
    setPhoneError('');
    setActiveProvider(null);
  }, [open]);

  // Escape hatch from the wallet-unlock/create dead-end: sign out of the
  // half-established identity (clears the Supabase session + pending flag so it
  // doesn't loop back to unlock) and return to the login options, modal open.
  const handleWalletLogout = async () => {
    await disconnect();
    setStep('main');
    setEmail('');
    setEmailCode('');
    setEmailError('');
    setPhone('');
    setPhoneCode('');
    setPhoneError('');
    setActiveProvider(null);
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setActiveProvider(provider);
    try {
      // Full-page OAuth redirect — the modal reopens at the wallet step on return.
      await connectWithProvider(provider);
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
      setEmailError(t('loginModal.invalidEmail'));
      return;
    }

    setActiveProvider('email');
    try {
      await connectWithEmail(email);
      setStep('email-waiting');
    } catch (error) {
      console.error('Email login failed:', error);
    } finally {
      setActiveProvider(null);
    }
  };

  const handleEmailCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    if (!/^\d{6}$/.test(emailCode.trim())) {
      setEmailError(t('loginModal.invalidCode', 'Enter the 6-digit code from your email'));
      return;
    }
    setActiveProvider('email-code');
    try {
      await verifyEmailOtp(email, emailCode.trim());
    } catch (error: any) {
      console.error('Email OTP verification failed:', error);
      setEmailError(error?.message || 'Invalid code. Please try again.');
    } finally {
      setActiveProvider(null);
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError('');

    const e164Regex = /^\+[1-9]\d{6,14}$/;
    if (!e164Regex.test(phone.trim())) {
      setPhoneError(t('loginModal.invalidPhone', 'Enter your number with country code, e.g. +14155552671'));
      return;
    }

    setActiveProvider('phone');
    try {
      await connectWithSMS(phone.trim());
      setStep('phone-code');
    } catch (error) {
      console.error('Phone login failed:', error);
    } finally {
      setActiveProvider(null);
    }
  };

  const handlePhoneCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError('');
    if (!/^\d{6}$/.test(phoneCode.trim())) {
      setPhoneError(t('loginModal.invalidCode', 'Enter the 6-digit code we texted you'));
      return;
    }
    setActiveProvider('phone');
    try {
      await verifyPhoneOtp(phone.trim(), phoneCode);
    } catch (error: any) {
      console.error('Phone OTP verification failed:', error);
      setPhoneError(error?.message || 'Invalid code. Please try again.');
    } finally {
      setActiveProvider(null);
    }
  };

  const handleWalletConnect = (wallet: WalletId, _connect: () => void) => {
    setActiveProvider(wallet);
    setWagmiAuthIntent(true);

    // If wagmi is already connected (kept alive from a previous session with an expired token),
    // don't call connect() again — the wagmiAuthIntentState change causes handleWagmiConnect
    // to re-fire and pick up the existing connection to complete DeHub auth.
    if (isWagmiAlreadyConnected && wagmiCurrentAddress) {
      return;
    }

    // Mobile: Use deep link to open wallet app and load dapp in its in-app browser.
    if (isMobileDevice() && !isWalletInAppBrowser()) {
      const deepLink = getWalletDeepLink(wallet);
      if (deepLink) {
        window.location.href = deepLink;
        return;
      }
    }

    // Use connectWithWallet (wagmi connectAsync) instead of RainbowKit's connect()
    // because RainbowKit's connect can become stale after a disconnect cycle.
    // connectWithWallet resolves to false (never rejects — it catches its own
    // errors and shows its own toast) on failure, so reset our local spinner
    // state here — without this, activeProvider stays stuck on this wallet
    // until the next click, since nothing else in this component learns the
    // attempt failed.
    connectWithWallet(wallet as any).then((success) => {
      if (!success) setActiveProvider(null);
    });
  };

  const handleWalletConnectConnect = (connect: () => void) => {
    setActiveProvider('walletconnect');
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
          <span>{t('loginModal.continueEmail')}</span>
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
          <span>{t('loginModal.continueGoogle')}</span>
        </Button>

        <Button
          onClick={() => setStep('phone')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          <Phone className="w-5 h-5" />
          <span>{t('loginModal.continuePhone', 'Continue with phone')}</span>
        </Button>

        <Button
          onClick={() => handleSocialLogin('apple')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          {activeProvider === 'apple' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <AppleIcon />
          )}
          <span>{t('loginModal.continueApple', 'Continue with Apple')}</span>
        </Button>
      </div>

      <div className="flex items-center gap-3 py-2">
        <Separator className="flex-1 bg-white/10" />
        <span className="text-white/40 text-sm">{t('loginModal.or')}</span>
        <Separator className="flex-1 bg-white/10" />
      </div>

      <Button
        onClick={() => setStep('wallets')}
        onPointerEnter={() => { void import('./LoginWalletsStep'); }}
        disabled={isConnecting}
        variant="outline"
        className="w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl flex items-center justify-center gap-3 border-white/10"
      >
        <Wallet className="w-5 h-5" />
        <span>{t('loginModal.connectWallet')}</span>
      </Button>
    </div>
  );

  const renderEmailStep = () => (
    <div className="space-y-4">
      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="email"
            placeholder={t('loginModal.emailPlaceholder')}
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
              {t('loginModal.sendingLink')}
            </span>
          ) : (
            t('loginModal.continue')
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          {t('loginModal.magicLinkInfo')}
        </p>
      </form>
    </div>
  );

  const renderEmailWaitingStep = () => (
    <div className="space-y-5">
      <div className="mx-auto w-14 h-14 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
        <Mail className="w-6 h-6 text-white" />
      </div>
      <div className="space-y-2 text-center">
        <p className="text-white text-sm">
          {t('loginModal.magicLinkSentTo', 'We sent a magic link to')}{' '}
          <span className="font-medium">{email}</span>
        </p>
        <p className="text-white/50 text-xs leading-relaxed">
          {t(
            'loginModal.magicLinkWaiting',
            'Open the email on any device and tap the button — you\'ll be signed in here automatically, plus on the device where you opened the link.'
          )}
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 text-white/50 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t('loginModal.waitingForLink', 'Waiting for you to confirm…')}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-white/40 text-xs">{t('loginModal.or', 'or')}</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={handleEmailCodeSubmit} className="space-y-3">
        <p className="text-white/50 text-xs text-center">
          {t('loginModal.enterCodeFromEmail', 'Enter the 6-digit code from the email')}
        </p>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={emailCode}
          onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          disabled={isConnecting}
          className="h-12 text-center tracking-[0.4em] bg-white/10 border-white/10 text-white placeholder:text-white/30 rounded-xl"
        />
        {emailError && <p className="text-red-400 text-sm text-center">{emailError}</p>}
        <Button
          type="submit"
          disabled={isConnecting || emailCode.length !== 6}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {activeProvider === 'email-code' ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('loginModal.verifying', 'Verifying…')}
            </span>
          ) : (
            t('loginModal.continue')
          )}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => { cancelEmailMagicLink(); setStep('email'); }}
        className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        {t('loginModal.wrongEmailGoBack', 'Wrong email? Go back')}
      </button>
    </div>
  );

  const renderPhoneStep = () => (
    <div className="space-y-4">
      <form onSubmit={handlePhoneSubmit} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="tel"
            placeholder={t('loginModal.phonePlaceholder', '+1 415 555 2671')}
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
          {activeProvider === 'phone' ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('loginModal.sendingLink')}
            </span>
          ) : (
            t('loginModal.continue')
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          {t('loginModal.phoneCodeInfo', "We'll text you a 6-digit verification code.")}
        </p>
      </form>
    </div>
  );

  const renderPhoneCodeStep = () => (
    <div className="space-y-4">
      <form onSubmit={handlePhoneCodeSubmit} className="space-y-4">
        <p className="text-white/60 text-sm text-center">
          {t('loginModal.codeSentTo', 'Enter the 6-digit code sent to')}{' '}
          <span className="text-white">{phone}</span>
        </p>
        <div className="space-y-2">
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={phoneCode}
            onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
            disabled={isConnecting}
            className="h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl text-center text-lg tracking-[0.5em]"
            autoFocus
          />
          {phoneError && (
            <p className="text-red-400 text-sm">{phoneError}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isConnecting || phoneCode.length !== 6}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {activeProvider === 'phone' ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('loginModal.verifying', 'Verifying…')}
            </span>
          ) : (
            t('loginModal.continue')
          )}
        </Button>

        <button
          type="button"
          onClick={() => { setPhoneCode(''); setStep('phone'); }}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          {t('loginModal.resendCodePhone', 'Wrong number or no code? Go back')}
        </button>
      </form>
    </div>
  );

  return (
    <>
      {step === 'main' && renderMainStep()}
      {step === 'email' && renderEmailStep()}
      {step === 'email-waiting' && renderEmailWaitingStep()}
      {step === 'phone' && renderPhoneStep()}
      {step === 'phone-code' && renderPhoneCodeStep()}
      {step === 'wallets' && (
        <React.Suspense fallback={<DeHubPageLoader size={56} minHeight="180px" />}>
          <LoginWalletsStep
            isConnecting={isConnecting}
            activeProvider={activeProvider}
            onWalletConnect={handleWalletConnect}
            onWalletConnectConnect={handleWalletConnectConnect}
          />
        </React.Suspense>
      )}
      {step === 'wallet-create' && supabaseUserId && (
        <React.Suspense fallback={<DeHubPageLoader size={56} minHeight="180px" />}>
          <WalletCreateStep userId={supabaseUserId} onComplete={completeSmartWalletLogin} />
        </React.Suspense>
      )}
      {step === 'wallet-unlock' && supabaseUserId && (
        <React.Suspense fallback={<DeHubPageLoader size={56} minHeight="180px" />}>
          <WalletUnlockStep userId={supabaseUserId} onComplete={completeSmartWalletLogin} onLogout={handleWalletLogout} />
        </React.Suspense>
      )}
      {/* The site preloader carries every gap in the wallet handoff: the
          resume itself, and a wallet step reached a beat before the identity
          id lands (which used to render an empty sheet). Same mark as the
          route loader, so the login flow doesn't invent its own idiom. */}
      {(step === 'resuming' || (step.startsWith('wallet-') && !supabaseUserId)) && (
        <DeHubPageLoader size={56} minHeight="180px" />
      )}
    </>
  );
}

export default LoginModalBody;
