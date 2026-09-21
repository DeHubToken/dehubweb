/**
 * Everything inside the login sheet below the header.
 *
 * Split out of LoginModal so the sheet itself — the drawer, the backdrop, the
 * header, the terms footer — can ship in the entry bundle and slide up on the
 * same frame as the click, while this (wagmi, the wallet steps, RainbowKit)
 * arrives behind it. See the note at the top of LoginModal.tsx.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useAccount, useConnectors, useDisconnect } from 'wagmi';
import { useTranslation } from 'react-i18next';
import { Phone, Wallet, Loader2, Fingerprint, ArrowDownToLine, KeyRound, X } from 'lucide-react';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { getWalletDeepLink, isMobileDevice, isWalletInAppBrowser } from '@/lib/web3auth';
import { clearWagmiStorage } from '@/lib/wagmi';
import { WagmiScope } from '@/components/app/WagmiScope';
import { connectorMatchesWallet } from '@/lib/wallet-connectors';
import { requestAccountPicker } from '@/lib/wallet-accounts';
import { PasskeyCancelledError, PasskeyLoginError, PasskeyUnsupportedError } from '@/lib/passkey-login';
import { loginProbesSnapshot, resolveLoginProbes, type LoginProbes } from '@/lib/login-probes';
import { LoginSavedProfiles } from './LoginSavedProfiles';
import { LoginBodySkeleton } from './LoginBodySkeleton';
import { getWalletSetupIntent, setWalletSetupIntent, type WalletSetupIntent } from '@/lib/wallet-setup-intent';
import type { LoginStep } from './steps';
import type { DiscoveredWallet, WalletId } from './LoginWalletsStep';

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

/**
 * How long the option list will hold for the probes before drawing itself
 * anyway. Long enough to cover a normal edge-function round trip, short enough
 * that a stalled one is never the reason someone cannot sign in.
 */
const PROBE_WAIT_MS = 700;

/** The wallets that already have a button of their own. */
const NAMED_WALLETS: WalletId[] = ['metamask', 'phantom', 'trust'];

// Social provider icons
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

// Telegram's mark, single-path so it tints with whatever colour the row uses
// rather than carrying its own blue into a monochrome sheet.
const TelegramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" className="fill-white">
    <path d="M21.94 4.6 18.63 20.2c-.25 1.1-.9 1.38-1.83.86l-5.05-3.72-2.44 2.35c-.27.27-.5.5-1.02.5l.36-5.14 9.36-8.46c.4-.36-.09-.56-.63-.2L6.01 13.67l-4.98-1.56c-1.08-.34-1.1-1.08.23-1.6l19.47-7.5c.9-.33 1.69.2 1.4 1.6z" />
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

/**
 * WagmiProvider no longer wraps the app (see WagmiRuntime.tsx), so this body —
 * which calls wagmi hooks — provides it for its own subtree. This file is
 * lazy, so the import of wagmi here stays off the boot path.
 */
export function LoginModalBody(props: LoginModalBodyProps) {
  return (
    <WagmiScope>
      <LoginModalBodyInner {...props} />
    </WagmiScope>
  );
}

function LoginModalBodyInner({ open, step, setStep }: LoginModalBodyProps) {
  const {
    connectWithProvider, connectWithEmail, cancelEmailMagicLink, verifyEmailOtp, connectWithSMS, verifyPhoneOtp,
    connectWithTelegram, connectWithPasskey, connectWithWallet, completeSmartWalletLogin, setWagmiAuthIntent, isConnecting,
    supabaseUserId, disconnect, isAuthenticated, switchToProfile,
  } = useAuth();
  const {
    isConnected: isWagmiAlreadyConnected,
    address: wagmiCurrentAddress,
    connector: wagmiCurrentConnector,
  } = useAccount();
  const { disconnectAsync: wagmiDisconnectAsync } = useDisconnect();
  const allConnectors = useConnectors();
  const { t } = useTranslation();

  /**
   * The wallets actually installed here, minus the ones that already have a
   * named button.
   *
   * wagmi discovers these over EIP-6963 (`multiInjectedProviderDiscovery` is on
   * by default) and has been doing so all along — the sheet just dropped them
   * and offered three fixed names. Anyone running Rabby, Coinbase Wallet, OKX
   * or Brave had to guess that "MetaMask" would reach their wallet, which it
   * does only when that extension happens to win the injection race.
   *
   * `injected` is the deliberately-hidden in-app-browser fallback (see
   * lib/wagmi.ts) and never belongs in a list of choices.
   */
  const discoveredWallets = useMemo<DiscoveredWallet[]>(() => {
    const seen = new Set<string>();
    return allConnectors
      .filter(connector => {
        if (connector.type !== 'injected') return false;
        if (connector.id === 'injected') return false;
        // One extension reaches wagmi twice — as the curated RainbowKit
        // connector and as its own EIP-6963 announcement — and the two carry
        // different ids, so the match has to go through the shared mapping
        // (which also checks the name) rather than an id comparison. Without
        // it Trust announces as `com.trustwallet.app` and gets a second row
        // directly under its own button.
        if (NAMED_WALLETS.some(wallet => connectorMatchesWallet(connector, wallet))) return false;
        const key = connector.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(connector => ({
        id: connector.id,
        name: connector.name,
        icon: connector.icon,
      }));
  }, [allConnectors]);

  /**
   * Which row in the list owns the live connection, so its address chip can be
   * rendered under that row rather than floating above the whole list.
   */
  const connectedWalletId = useMemo<string | null>(() => {
    if (!isWagmiAlreadyConnected || !wagmiCurrentConnector) return null;
    for (const wallet of NAMED_WALLETS) {
      if (connectorMatchesWallet(wagmiCurrentConnector, wallet)) return wallet;
    }
    if (wagmiCurrentConnector.id === 'walletConnect') return 'walletconnect';
    return discoveredWallets.some(w => w.id === wagmiCurrentConnector.id)
      ? wagmiCurrentConnector.id
      : null;
  }, [isWagmiAlreadyConnected, wagmiCurrentConnector, discoveredWallets]);

  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  // "Migrate account" / "Import external wallet", chosen before signing in.
  // Mirrored from sessionStorage so it survives an OAuth redirect and reaches
  // the wallet step once the identity exists (see lib/wallet-setup-intent).
  const [setupIntent, setSetupIntentState] = useState<WalletSetupIntent | null>(() => getWalletSetupIntent());
  const chooseSetupIntent = (intent: WalletSetupIntent | null) => {
    setWalletSetupIntent(intent);
    setSetupIntentState(intent);
  };
  /**
   * Whether the Telegram row belongs on the sheet at all.
   *
   * The bot lives in the telegram-auth edge function's env, which deploys on
   * its own track — so the button asks the function rather than a build-time
   * flag, and stays off until a bot is actually configured. Starts false and
   * only ever turns on, so an unconfigured project shows no row at all rather
   * than one that fails when tapped.
   *
   * Whether this browser can do a passkey rides along with it (same pre-filter
   * the wallet's biometric unlock uses; a definite "no" hides the row rather
   * than offering a prompt that cannot appear). Both are asked as one in
   * lib/login-probes, and the option list waits for the pair — two separate
   * answers arriving separately is what made the sheet grow a row, then
   * another, in front of the person reading it.
   */
  const [probes, setProbes] = useState<LoginProbes | null>(() => loginProbesSnapshot());
  const telegramEnabled = probes?.telegram ?? false;
  const passkeyAvailable = probes?.passkey ?? false;
  const [passkeyError, setPasskeyError] = useState('');
  // Set when a sign-in attempt found a passkey with no account behind it, so
  // the step can lead with "create one instead".
  const [passkeyUnknown, setPasskeyUnknown] = useState(false);

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
    setPasskeyError('');
    setPasskeyUnknown(false);
    setActiveProvider(null);
  }, [open]);

  /**
   * Both answers, once, the moment the sheet opens — and normally already in
   * hand from the hover that preceded the click (see warmLoginSheet). Cached
   * for the tab by lib/login-probes, so every reopen after the first renders
   * the finished list on its first frame with no probe at all.
   *
   * The cap is the safety valve: on a network slow enough that the Telegram
   * config has not come back yet, the list stops waiting and draws what it
   * knows rather than holding a skeleton over a working sign-in sheet. A late
   * answer still applies — one deferred row on a bad connection beats a
   * missing way in.
   */
  useEffect(() => {
    if (!open || probes) return;
    let cancelled = false;
    const cap = window.setTimeout(() => {
      if (!cancelled) setProbes(current => current ?? { passkey: false, telegram: false });
    }, PROBE_WAIT_MS);
    void resolveLoginProbes().then(resolved => {
      if (!cancelled) setProbes(resolved);
    });
    return () => { cancelled = true; window.clearTimeout(cap); };
  }, [open, probes]);

  // Once the connector has agreed, the wallet list is done: what happens next
  // is a signature request, and everything on that screen either does nothing
  // (the buttons are disabled) or actively misleads — the "Connected · 0x…"
  // banner appears at exactly the moment the signature goes out, so a login
  // that was working read as a login that had bounced back to the picker.
  // Swap it for the same "Signing you in…" loader the social/email resume
  // uses, and put the list back if the attempt ends without a session.
  //
  // Gated on `open` so the revert can't fire on the way out: a successful login
  // drops isConnecting and closes the sheet in the same commit, and without
  // this the wallet list would flash back for the length of the exit animation.
  useEffect(() => {
    if (!open) return;
    if (step === 'wallets' && isConnecting && isWagmiAlreadyConnected && wagmiCurrentAddress) {
      setStep('wallet-signing');
    } else if (step === 'wallet-signing' && !isConnecting) {
      setStep('wallets');
    }
  }, [open, step, isConnecting, isWagmiAlreadyConnected, wagmiCurrentAddress, setStep]);

  // Escape hatch from the wallet-unlock/create dead-end: sign out of the
  // half-established identity (clears the Supabase session + pending flag so it
  // doesn't loop back to unlock) and return to the login options, modal open.
  const handleWalletLogout = async () => {
    await disconnect();
    chooseSetupIntent(null);
    setStep('main');
    setEmail('');
    setEmailCode('');
    setEmailError('');
    setPhone('');
    setPhoneCode('');
    setPhoneError('');
    setActiveProvider(null);
  };

  // Restores that account's stored session and reloads. Resolves without
  // reloading only when the snapshot could not be restored, in which case
  // switchToProfile has already opened the sheet on a real login.
  const handleSwitchProfile = (id: string) => {
    void switchToProfile(id);
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

  // Resolves `true` once the redirect is under way, and the spinner stays up
  // over it — the browser is leaving, and a row that snaps back to its idle
  // label in that gap reads as a click that did nothing.
  const handleTelegramLogin = async () => {
    setActiveProvider('telegram');
    try {
      if (await connectWithTelegram()) return;
    } catch (error) {
      console.error('Telegram login failed:', error);
    }
    setActiveProvider(null);
  };

  const handlePasskey = async (mode: 'signin' | 'signup') => {
    setPasskeyError('');
    setActiveProvider(mode === 'signup' ? 'passkey-signup' : 'passkey-signin');
    try {
      await connectWithPasskey(mode);
    } catch (error) {
      if (error instanceof PasskeyCancelledError) {
        // Dismissing the OS sheet isn't a failure — no message.
      } else if (error instanceof PasskeyUnsupportedError) {
        setPasskeyError(t('loginModal.passkeyUnsupported', "This device can't sign in with a fingerprint or face. Use another option."));
      } else if (error instanceof PasskeyLoginError && error.code === 'UNKNOWN_CREDENTIAL') {
        setPasskeyUnknown(true);
        setPasskeyError(t('loginModal.passkeyNotLinked', 'No account is linked to that fingerprint yet. Create a new account instead.'));
      } else if (error instanceof PasskeyLoginError && error.code === 'ALREADY_REGISTERED') {
        setPasskeyError(t('loginModal.passkeyAlreadyRegistered', 'That fingerprint already has an account. Use Sign in instead.'));
      } else {
        console.error('Passkey login failed:', error);
        setPasskeyError(error instanceof Error && error.message
          ? error.message
          : t('loginModal.passkeyFailed', 'Fingerprint sign-in failed. Please try again.'));
      }
    } finally {
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

  // A live connection is worth reusing only when it belongs to the wallet that
  // was tapped. In a wallet's own in-app browser there is exactly one provider
  // and every button reaches it through the generic injected connector, so that
  // counts as a match too.
  const liveConnectionIsWallet = (wallet: WalletId) =>
    isWagmiAlreadyConnected &&
    !!wagmiCurrentAddress &&
    (connectorMatchesWallet(wagmiCurrentConnector, wallet) ||
      (isWalletInAppBrowser() && wagmiCurrentConnector?.id === 'injected'));

  // Drop the wallet currently attached without touching the DeHub session —
  // `disconnect()` from the auth context is a full sign-out, which is not what
  // someone standing at the login sheet is asking for. wagmi's disconnect also
  // revokes the site's permission where the wallet supports it, so the next
  // connect offers the account picker rather than silently reusing the account
  // that was already approved.
  const handleUseDifferentWallet = async () => {
    setWagmiAuthIntent(false);
    setActiveProvider(null);
    clearWagmiStorage();
    try {
      await wagmiDisconnectAsync();
    } catch { /* already gone */ }
  };

  const handleWalletConnect = (wallet: WalletId, _connect: () => void) => {
    setActiveProvider(wallet);
    setWagmiAuthIntent(true, wallet);

    // A connection kept alive from a previous session (expired token, still
    // connected) only needs the signature — the wagmiAuthIntentState change
    // re-fires handleWagmiConnect, which picks the connection up and completes
    // DeHub auth. This used to fire for a connection to ANY wallet, so tapping
    // a second wallet re-signed with the first one: the popup the user had just
    // cancelled came straight back, from the wallet they were trying to leave.
    // Naming the wallet on the intent is the other half of that — the effect
    // fires on every tap, so it has to be able to tell that the connection it
    // finds is not the one being asked for.
    if (liveConnectionIsWallet(wallet)) {
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
    setWagmiAuthIntent(true, 'walletconnect');
    connect();
  };

  const handleDiscoveredWalletConnect = (connectorId: string) => {
    // Same path as the named buttons — connectWithWallet resolves a connector
    // id it doesn't recognise as a wallet name by matching the id directly.
    handleWalletConnect(connectorId as WalletId, () => {});
  };

  /**
   * Ask the connected wallet to re-offer its account picker.
   *
   * This is the way out of the dead end that made people delete the site from
   * inside MetaMask: the extension holds account B, the sheet asks it to sign
   * as account A, and it refuses with an error that is neither a rejection nor
   * a timeout. Nothing a site can do picks an account on someone's behalf —
   * `wallet_requestPermissions` opening the wallet's own picker is the entire
   * available surface.
   *
   * Once an account comes back the connection is already the right wallet, so
   * this only has to raise the auth intent: AuthProvider's wagmi effect signs,
   * and it reads the wallet's live account first, so it uses the account just
   * chosen even before `accountsChanged` has reached wagmi.
   */
  // WalletConnect has no account picker to open — the accounts come from a
  // remote wallet over a relay, and nothing in the protocol re-opens its
  // chooser. Offering the control there would only ever produce a no-op.
  const canSwitchAccount =
    !!connectedWalletId && wagmiCurrentConnector?.id !== 'walletConnect';

  const handleSwitchAccount = async () => {
    if (!wagmiCurrentConnector || !connectedWalletId) return;
    setActiveProvider(connectedWalletId);
    const chosen = await requestAccountPicker(wagmiCurrentConnector);
    if (!chosen) {
      setActiveProvider(null);
      return;
    }
    handleWalletConnect(connectedWalletId as WalletId, () => {});
  };

  const renderMainStep = () => (
    <div className="space-y-4">
      {/* Signed-out only. Over a live session this sheet is "Add a profile",
          where the accounts already on the device are the one thing it is not
          offering to do. */}
      {!isAuthenticated && (
        <LoginSavedProfiles disabled={isConnecting} onSwitch={handleSwitchProfile} />
      )}
      {/* The chosen intent stays visible while they pick a sign-in method:
          any of the options below reaches the wallet step, which then opens
          straight on Migrate or Import instead of a new account. */}
      {setupIntent && (
        <div className="flex items-start gap-2 rounded-xl border border-white/15 bg-white/10 p-3 text-sm text-white">
          {setupIntent === 'migrate'
            ? <ArrowDownToLine className="w-4 h-4 mt-0.5 shrink-0" />
            : <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />}
          <p className="flex-1 min-w-0">
            {setupIntent === 'migrate'
              ? t('loginModal.migrateIntentHint', 'Sign in with any option below. If it matches an earlier DeHub account you will bring over its wallet, username and balance.')
              : t('loginModal.importIntentHint', 'Sign in with any option below, then paste the recovery phrase or private key of the wallet you want to use.')}
          </p>
          <button
            type="button"
            onClick={() => chooseSetupIntent(null)}
            aria-label={t('common.cancel', 'Cancel')}
            className="p-1 -m-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="space-y-3">
        <Button
          onClick={() => setStep('email')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          <ThemedIcon icon="email" alt="" className="w-5 h-5 object-contain" />
          <span>{t('loginModal.continueEmail')}</span>
        </Button>

        {passkeyAvailable && (
          <Button
            onClick={() => setStep('passkey')}
            disabled={isConnecting}
            className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
          >
            <Fingerprint className="w-5 h-5" />
            <span>{t('loginModal.continuePasskey', 'Continue with fingerprint')}</span>
          </Button>
        )}

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

        {telegramEnabled && (
          <Button
            onClick={handleTelegramLogin}
            disabled={isConnecting}
            className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
          >
            {activeProvider === 'telegram' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <TelegramIcon />
            )}
            <span>{t('loginModal.continueTelegram', 'Continue with Telegram')}</span>
          </Button>
        )}
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

      {/* Two more ways in, both of which still need a sign-in above first:
          the wallet is tied to the identity, so the choice is recorded now
          and acted on at the wallet step. */}
      {!setupIntent && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => chooseSetupIntent('migrate')}
            disabled={isConnecting}
            variant="outline"
            className="h-12 bg-transparent hover:bg-white/5 text-white rounded-xl flex items-center justify-center gap-2 border-white/10 px-2"
          >
            <ArrowDownToLine className="w-5 h-5 shrink-0" />
            <span className="truncate">{t('loginModal.migrateAccount', 'Migrate account')}</span>
          </Button>
          <Button
            onClick={() => chooseSetupIntent('import')}
            disabled={isConnecting}
            variant="outline"
            className="h-12 bg-transparent hover:bg-white/5 text-white rounded-xl flex items-center justify-center gap-2 border-white/10 px-2"
          >
            <KeyRound className="w-5 h-5 shrink-0" />
            <span className="truncate">{t('loginModal.importExternalWallet', 'Import external wallet')}</span>
          </Button>
        </div>
      )}
    </div>
  );

  const renderPasskeyStep = () => (
    <div className="space-y-4">
      <p className="text-white/60 text-sm">
        {t('loginModal.passkeyIntro', 'Your fingerprint or face is your account. Nothing to remember, nothing to type.')}
      </p>
      <Button
        onClick={() => handlePasskey('signin')}
        disabled={isConnecting}
        className="w-full h-12 bg-white text-black hover:bg-white/90 rounded-xl flex items-center justify-center gap-3"
      >
        {activeProvider === 'passkey-signin' ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Fingerprint className="w-5 h-5" />
        )}
        <span>{t('loginModal.passkeySignIn', 'Sign in with fingerprint')}</span>
      </Button>
      <Button
        onClick={() => handlePasskey('signup')}
        disabled={isConnecting}
        variant="outline"
        className={passkeyUnknown
          ? 'w-full h-12 bg-white text-black hover:bg-white/90 rounded-xl flex items-center justify-center gap-3 border-transparent'
          : 'w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl flex items-center justify-center gap-3 border-white/10'}
      >
        {activeProvider === 'passkey-signup' ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Fingerprint className="w-5 h-5" />
        )}
        <span>{t('loginModal.passkeyCreate', 'Create a new account')}</span>
      </Button>
      {passkeyError && (
        <p className="text-red-400 text-sm">{passkeyError}</p>
      )}
      <p className="text-white/40 text-xs">
        {t('loginModal.passkeyBackupHint', "Your account lives in this device's passkey. On most phones it syncs with your Google or Apple account, and you can add a password backup in Settings.")}
      </p>
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
        <ThemedIcon icon="email" alt="" className="w-8 h-8 object-contain" />
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
      {/* The same placeholder the shell shows while this chunk is in flight,
          so the wait for the chunk and the wait for the probes read as one
          beat rather than two — and the options appear once, complete. */}
      {step === 'main' && (probes ? renderMainStep() : <LoginBodySkeleton />)}
      {step === 'passkey' && renderPasskeyStep()}
      {step === 'email' && renderEmailStep()}
      {step === 'email-waiting' && renderEmailWaitingStep()}
      {step === 'phone' && renderPhoneStep()}
      {step === 'phone-code' && renderPhoneCodeStep()}
      {step === 'wallets' && (
        <React.Suspense fallback={<DeHubPageLoader size={56} minHeight="180px" />}>
          <LoginWalletsStep
            isConnecting={isConnecting}
            activeProvider={activeProvider}
            connectedAddress={isWagmiAlreadyConnected ? wagmiCurrentAddress ?? null : null}
            connectedWalletName={wagmiCurrentConnector?.name ?? null}
            connectedWalletId={connectedWalletId}
            discoveredWallets={discoveredWallets}
            onUseDifferentWallet={handleUseDifferentWallet}
            onSwitchAccount={canSwitchAccount ? handleSwitchAccount : undefined}
            onWalletConnect={handleWalletConnect}
            onDiscoveredWalletConnect={handleDiscoveredWalletConnect}
            onWalletConnectConnect={handleWalletConnectConnect}
          />
        </React.Suspense>
      )}
      {step === 'wallet-create' && supabaseUserId && (
        <React.Suspense fallback={<DeHubPageLoader size={56} minHeight="180px" />}>
          <WalletCreateStep
            userId={supabaseUserId}
            intent={setupIntent}
            onComplete={async (key) => {
              await completeSmartWalletLogin(key);
              chooseSetupIntent(null);
            }}
          />
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
      {(step === 'resuming' || step === 'wallet-signing' || (step.startsWith('wallet-') && !supabaseUserId)) && (
        <DeHubPageLoader size={56} minHeight="180px" />
      )}
    </>
  );
}

export default LoginModalBody;
