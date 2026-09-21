/**
 * Login sheet — the shell.
 * ========================
 * Fully branded login experience. Social logins via Web3Auth, wallet
 * connections via standard Wagmi.
 *
 * This file is deliberately cheap and deliberately NOT lazy: the drawer, its
 * backdrop, the header and the terms footer are all here, so tapping "Log in"
 * puts the sheet on screen on the same frame as the click. Everything with a
 * real cost — wagmi, the wallet-setup steps, RainbowKit's ~270 KB of connect
 * UI — is below the Suspense boundary and arrives behind the open sheet.
 *
 * It used to be one lazy component. Clicking "Log in" then bought a chunk
 * fetch, and the evaluation of that chunk's whole static graph, BEFORE vaul
 * could mount and start the slide-up: the sheet waited for its own contents,
 * which is exactly what "it feels slow" was describing. Nothing about the
 * finished sheet has changed; only when each part of it is paid for.
 *
 * Keep this file's imports boring. Anything pulled in here lands in the entry
 * bundle, which is ratcheted by scripts/check-entry-bundle.mjs — in particular
 * `wagmi`, which must stay behind the WalletProviders lazy boundary.
 */

import React, { Suspense, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, warmDeferredSheets } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { type LoginStep, resumingStep } from '@/components/app/login/steps';
import { getWalletSetupIntent, setWalletSetupIntent } from '@/lib/wallet-setup-intent';
import dehubLogo from '@/assets/dehub-logo-white.png';
import { useKeyboardSafeSheet } from '@/hooks/use-keyboard-open';

const LoginModalBody = React.lazy(() =>
  import('@/components/app/login/LoginModalBody').then(m => ({ default: m.LoginModalBody })),
);

// The last step of signing up, and the only one an existing session can land on
// cold. Its own chunk so it does not drag the wallet body in behind it.
const LoginProfileStep = React.lazy(() =>
  import('@/components/app/login/LoginProfileStep').then(m => ({ default: m.LoginProfileStep })),
);

/**
 * Warm the body chunk so the skeleton below is insurance rather than the norm.
 * Called from App once the app has painted; safe to call repeatedly.
 */
export function prefetchLoginModal(): void {
  void import('@/components/app/login/LoginModalBody').catch(() => {});
}

/**
 * Call from a login entry point's hover / pointerdown — BEFORE the click. Two
 * things get done in the gap where they cost nothing visible: this drawer's
 * first-open mount dance (dormant→mounting→live) runs early, and the body
 * chunk starts arriving if the idle prefetch was starved. Both are idempotent;
 * once live the sheet behaves exactly as any reopened sheet does.
 */
export function warmLoginSheet(): void {
  warmDeferredSheets();
  prefetchLoginModal();
  // The wallet connectors (RainbowKit, MetaMask SDK, WalletConnect) left the
  // boot path — see lib/wagmi-wallets. On intent, not on idle: pulling them
  // for every visitor at idle would put ~500 KB back on every visit.
  void import('@/lib/wagmi-wallets').catch(() => {});
}

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * What the sheet shows in the beat before the body lands: the shape of the
 * sign-in options, not a spinner. The options are four full-width pills and a
 * divider, so the placeholder is too — the swap changes the contents of the
 * rows, never the height of the sheet.
 */
function LoginBodySkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-white/[0.07] border border-white/10 animate-pulse" />
        ))}
      </div>
      <div className="flex items-center gap-3 py-2">
        <div className="h-px flex-1 bg-white/10" />
        <div className="h-3 w-6 rounded bg-white/[0.07]" />
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="h-12 rounded-xl border border-white/10 animate-pulse" />
    </div>
  );
}

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const { style: keyboardStyle } = useKeyboardSafeSheet(open);
  const { walletPhase, isProcessingRedirect, loginIntent, requiresUsername } = useAuth();
  const { t } = useTranslation();

  // Opening step. A login that is ALREADY in flight must never land on 'main':
  // the redirect-return and mid-session unlock paths open the sheet with the
  // phase already decided, so a plain 'main' default painted the whole
  // "Continue with Google / email / phone" sheet before the mirror below could
  // swap it — the flash that reads as "it failed, sign in again" at the exact
  // moment the user is waiting to be let in.
  const [step, setStep] = useState<LoginStep>(
    () => resumingStep(walletPhase, isProcessingRedirect) ?? 'main',
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768,
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Route to the wallet create/unlock step once the Supabase identity exists
  // (after email OTP verification or an OAuth redirect return), and hold the
  // preloader over the wait in between.
  //
  // useLayoutEffect, not useEffect: a passive effect runs AFTER the browser has
  // painted, so on an already-mounted modal being reopened straight onto the
  // unlock step the sign-in options got a frame on screen first. This runs
  // before paint, so that frame never exists.
  useLayoutEffect(() => {
    if (!open) return;
    const next = resumingStep(walletPhase, isProcessingRedirect);
    if (next) {
      setStep(next);
      return;
    }
    // Checked after the wallet steps, not before: a brand-new account is
    // flagged as needing a profile by the same auth response that may still
    // owe it a wallet, and the wallet has to come first.
    if (requiresUsername) {
      setStep('profile');
      return;
    }
    // The resume ended without producing a wallet step — it either failed or
    // the session was already complete. Never strand the sheet on the loader,
    // or on a profile step whose flag has since cleared. Any other step is left
    // alone (React bails out on an unchanged value), so this can't yank someone
    // out of the email or phone flow.
    setStep((s) => (s === 'resuming' || s === 'profile' ? 'main' : s));
  }, [open, walletPhase, isProcessingRedirect, requiresUsername]);

  const handleClose = useCallback(() => {
    // An account with no profile is not a usable account: there is nothing
    // behind this sheet to go back to, so it does not close. Log out is the
    // other way out, and it clears the flag itself.
    if (requiresUsername) return;
    // Closing by hand abandons a "Migrate account" / "Import external wallet"
    // choice too; a completed login clears it itself.
    setWalletSetupIntent(null);
    setStep('main');
    onOpenChange(false);
  }, [onOpenChange, requiresUsername]);

  // The sheet can also be closed from underneath it — a completed login calls
  // closeLoginModal directly, and vaul never reports a close it did not drive.
  // handleClose was therefore the ONLY thing resetting the step, so a sheet
  // that closed on success kept 'wallets' and the next open landed straight
  // back on the wallet picker. Reset here instead, once the sheet is shut, so
  // nothing flashes on the way out.
  useEffect(() => {
    if (!open) setStep('main');
  }, [open]);

  // Opened from Settings → Profile → Add profile while already signed in.
  // Retitled so the sheet reads as "adding another account" rather than
  // implying the current one just got signed out — it didn't.
  const titleText = step === 'main' ? (
      loginIntent === 'add-profile'
        ? t('loginModal.addProfileTitle', 'Add a profile')
        : t('loginModal.title')
    )
    : step === 'email' ? t('loginModal.continueEmail')
    : step === 'email-waiting' ? t('loginModal.checkYourEmail', 'Check your email')
    : step === 'phone' ? t('loginModal.continuePhone', 'Continue with phone')
    : step === 'phone-code' ? t('loginModal.enterCode', 'Enter verification code')
    : step === 'passkey' ? t('loginModal.continuePasskey', 'Continue with fingerprint')
    // "Secure account", not "Create your wallet": this step is most people's
    // first encounter with the wallet, and leading with crypto vocabulary puts
    // off users who came for the app. What the step actually does — make the
    // account only usable by them — is also the more accurate description.
    : step === 'wallet-create' ? (
        getWalletSetupIntent() === 'migrate' ? t('loginModal.migrateAccount', 'Migrate account')
        : getWalletSetupIntent() === 'import' ? t('loginModal.importExternalWallet', 'Import external wallet')
        : t('loginModal.secureAccount', 'Secure account')
      )
    : step === 'wallet-unlock' ? t('loginModal.unlockWallet', 'Unlock your wallet')
    : step === 'profile' ? t('settings.profile')
    : step === 'resuming' || step === 'wallet-signing' ? t('loginModal.signingIn', 'Signing you in…')
    : t('loginModal.connectWallet');

  // Only the sign-in options are worth sketching. Every other step is a wait or
  // a form the user has already been told about, so it gets the site loader —
  // the same mark the resume itself uses.
  const fallback = step === 'main'
    ? <LoginBodySkeleton />
    : <DeHubPageLoader size={56} minHeight="180px" />;

  // A wallet password is a focused security interruption, not a page-wide
  // task. On desktop it therefore lives as a compact panel centred inside the
  // app's middle column. The mobile flow deliberately remains a bottom sheet,
  // where that presentation is both expected and keyboard-safe.
  const usesDesktopUnlockPanel = step === 'wallet-unlock' && !isMobile;

  const sheetBody = (
    <>
      <DrawerHeader className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-center justify-center relative">
          {/* No way back from 'profile' either - the account is already
              created by the time it shows. */}
          {step !== 'main' && step !== 'resuming' && step !== 'profile' && !step.startsWith('wallet-') && (
            <button
              onClick={() => setStep('main')}
              className="absolute left-0 p-2 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
          )}
          <img src={dehubLogo} alt="DeHub" className="h-8" />
        </div>
        {usesDesktopUnlockPanel ? (
          <DialogTitle className="text-base font-medium text-white mt-4 text-center">
            {titleText}
          </DialogTitle>
        ) : (
          <DrawerTitle className="text-base font-medium text-white mt-4 text-center">
            {titleText}
          </DrawerTitle>
        )}
      </DrawerHeader>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">
        <Suspense fallback={fallback}>
          {/* Kept out of LoginModalBody deliberately: that chunk carries
              wagmi, and the profile step is reached on a plain session
              restore (an account saved without a username) where no wallet
              UI is needed. */}
          {step === 'profile'
            ? <LoginProfileStep />
            : <LoginModalBody open={open} step={step} setStep={setStep} />}
        </Suspense>
      </div>

      <div className="shrink-0 px-6 py-4 bg-black/20 border-t border-white/10 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <p className="text-xs text-white/40 text-center">
          By continuing, you agree to our{' '}
          <a href="https://dehub.io/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60 transition-colors">
            Terms
          </a>
          {' and '}
          <a href="https://dehub.io/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60 transition-colors">
            Privacy Policy
          </a>
        </p>
      </div>
    </>
  );

  if (usesDesktopUnlockPanel) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          data-login-modal
          style={keyboardStyle ?? undefined}
          hideCloseButton
          onEscapeKeyDown={(e) => { if (requiresUsername) e.preventDefault(); }}
          className="bg-black/60 backdrop-blur-2xl saturate-[180%] border border-white/10 p-0 gap-0 rounded-2xl overflow-hidden z-[2147483646] flex flex-col max-h-[90dvh] sm:left-[calc(var(--app-main-left,0px)+var(--app-main-width,100vw)/2)] sm:w-[min(32rem,calc(var(--app-main-width,100vw)-2rem))] sm:max-w-none"
          overlayClassName="z-[2147483645] login-modal-overlay bg-black/40 backdrop-blur-xl"
        >
          {sheetBody}
        </DialogContent>
      </Dialog>
    );
  }

  // `column`: on desktop the sheet clips to the middle panel's live bounds, the
  // same as every other sheet in the app, so it opens in the gap between the
  // sidebars instead of spanning the whole viewport. The backdrop stays full
  // width deliberately — it blurs the sidebars too, so nothing outside the
  // sign-in flow competes with it.
  return (
    <Drawer open={open} onOpenChange={handleClose} warmable walletPrompt dismissible={!requiresUsername} repositionInputs={false}>
      <DrawerContent
        data-login-modal
        column
        style={keyboardStyle ?? undefined}
        hideHandle
        onEscapeKeyDown={(e) => { if (requiresUsername) e.preventDefault(); }}
        className="bg-black/60 backdrop-blur-2xl saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden z-[2147483646] flex flex-col max-h-[90dvh]"
        overlayClassName="z-[2147483645] login-modal-overlay backdrop-blur-xl md:bg-black/40"
      >
        {sheetBody}
      </DrawerContent>
    </Drawer>
  );
}

export default LoginModal;
