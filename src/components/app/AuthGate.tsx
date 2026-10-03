/**
 * Auth Gate Component
 * ===================
 * A unified auth gate UI that shows skeleton while loading auth state.
 * Opens the custom LoginModal instead of the default Web3Auth modal.
 * 
 * @module components/app/AuthGate
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { ASSISTANT_AVATAR as assistantAvatar } from '@/lib/assistant';

export function AuthGate({ description: _description }: { description?: string } = {}) {
  const { t } = useTranslation();
  const { openLoginModal, isLoading, isConnecting, needsSignature } = useAuth();
  // A missing or slow avatar must never block the sign-in controls.
  const showSkeleton = isLoading;

  const handleLogin = () => {
    openLoginModal();
  };

  const getButtonText = () => {
    if (isConnecting) return t('nav.connecting');
    if (needsSignature) return t('nav.signMessage');
    return t('nav.login');
  };

  return (
    <div data-auth-gate className="flex flex-col items-center justify-center min-h-[calc(100svh_-_64px_-_var(--app-top-bar))] lg:min-h-screen p-8 -mt-[30px] lg:-mt-[50px]">
      {showSkeleton ? (
        <>
          <div className="w-20 h-20 mb-6 rounded-full bg-white/[0.06] animate-pulse" />
          <div className="h-6 w-40 bg-white/[0.06] rounded animate-pulse mb-6" />
          <div className="h-10 w-24 bg-white/[0.06] rounded-xl animate-pulse" />
        </>
      ) : (
        <>
          <img 
           src={assistantAvatar} 
            alt="Log in" 
            className="w-20 h-20 object-contain mb-6 translate-y-[11px]"
          />
          <h2 className="text-xl font-semibold text-white mb-6">{t('auth.loginRequired')}</h2>
          <Button 
            onClick={handleLogin}
            disabled={isConnecting}
            variant="glass"
            data-primary-cta
            className="rounded-xl font-semibold px-6 min-w-[120px]"
          >

            {isConnecting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {getButtonText()}
              </span>
            ) : (
              getButtonText()
            )}
          </Button>
        </>
      )}
    </div>
  );
}

export default AuthGate;
