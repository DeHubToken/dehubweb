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
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { type LoginStep, resumingStep } from '@/components/app/login/steps';
import dehubLogo from '@/assets/dehub-logo-white.png';

const LoginModalBody = React.lazy(() =>
  import('@/components/app/login/LoginModalBody').then(m => ({ default: m.LoginModalBody })),
);

/**
 * Warm the body chunk so the skeleton below is insurance rather than the norm.
 * Called from App once the app has painted; safe to call repeatedly.
 */
export function prefetchLoginModal(): void {
  void import('@/components/app/login/LoginModalBody').catch(() => {});
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
  const { walletPhase, isProcessingRedirect } = useAuth();
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
    // The resume ended without producing a wallet step — it either failed or
    // the session was already complete. Never strand the sheet on the loader.
    // Any other step is left alone (React bails out on an unchanged value), so
    // this can't yank someone out of the email or phone flow.
    setStep((s) => (s === 'resuming' ? 'main' : s));
  }, [open, walletPhase, isProcessingRedirect]);

  const handleClose = useCallback(() => {
    setStep('main');
    onOpenChange(false);
  }, [onOpenChange]);

  const titleText = step === 'main' ? t('loginModal.title')
    : step === 'email' ? t('loginModal.continueEmail')
    : step === 'email-waiting' ? t('loginModal.checkYourEmail', 'Check your email')
    : step === 'phone' ? t('loginModal.continuePhone', 'Continue with phone')
    : step === 'phone-code' ? t('loginModal.enterCode', 'Enter verification code')
    // "Secure account", not "Create your wallet": this step is most people's
    // first encounter with the wallet, and leading with crypto vocabulary puts
    // off users who came for the app. What the step actually does — make the
    // account only usable by them — is also the more accurate description.
    : step === 'wallet-create' ? t('loginModal.secureAccount', 'Secure account')
    : step === 'wallet-unlock' ? t('loginModal.unlockWallet', 'Unlock your wallet')
    : step === 'resuming' ? t('loginModal.signingIn', 'Signing you in…')
    : t('loginModal.connectWallet');

  // Only the sign-in options are worth sketching. Every other step is a wait or
  // a form the user has already been told about, so it gets the site loader —
  // the same mark the resume itself uses.
  const fallback = step === 'main'
    ? <LoginBodySkeleton />
    : <DeHubPageLoader size={56} minHeight="180px" />;

  // Both mobile and desktop use the same bottom-sheet Drawer. On desktop the
  // overlay and sheet are clipped to the middle panel's live bounds
  // (--app-main-left/--app-main-width, measured in AppLayout) so it opens as
  // a drawer in the gap between the sidebars instead of spanning the full
  // viewport. Falls back to full-viewport when those vars are unset (e.g.
  // routes without the app shell/sidebars).
  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent
        data-login-modal
        hideHandle
        className={cn(
          "bg-black/60 backdrop-blur-2xl saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden z-[200] flex flex-col max-h-[90dvh]",
          !isMobile && "left-[var(--app-main-left,0px)] right-auto w-[var(--app-main-width,100vw)]",
        )}
        overlayClassName={cn(
          // Unlike the drawer sheet itself (clipped to the middle panel
          // above), the backdrop spans the full viewport — including both
          // sidebars — and blurs everything outside the login flow to pull
          // full attention onto it (mobile keeps its darker bg-black/80
          // dim from DrawerOverlay's base classes).
          "z-[200] login-modal-overlay backdrop-blur-xl",
          !isMobile && "bg-black/40",
        )}
      >
        <DrawerHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center justify-center relative">
            {step !== 'main' && step !== 'resuming' && !step.startsWith('wallet-') && (
              <button
                onClick={() => setStep('main')}
                className="absolute left-0 p-2 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            )}
            <img src={dehubLogo} alt="DeHub" className="h-8" />
          </div>
          <DrawerTitle className="text-base font-medium text-white mt-4 text-center">
            {titleText}
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">
          <Suspense fallback={fallback}>
            <LoginModalBody open={open} step={step} setStep={setStep} />
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
      </DrawerContent>
    </Drawer>
  );
}

export default LoginModal;
