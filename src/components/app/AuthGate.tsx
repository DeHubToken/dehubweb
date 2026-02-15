/**
 * Auth Gate Component
 * ===================
 * A unified auth gate UI that shows skeleton while loading auth state
 * or while the avatar image is loading, ensuring all content appears together.
 * Opens the custom LoginModal instead of the default Web3Auth modal.
 * 
 * @module components/app/AuthGate
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import assistantAvatar from '@/assets/assistant-avatar.png';

interface AuthGateProps {
  /** Description shown below "Log in required" */
  description: string;
}

export function AuthGate({ description }: AuthGateProps) {
  const { openLoginModal, isLoading, isConnecting, needsSignature } = useAuth();
  const [imageLoaded, setImageLoaded] = useState(false);

  // Show skeleton while auth is loading OR while image hasn't loaded yet
  const showSkeleton = isLoading || !imageLoaded;

  const handleLogin = () => {
    openLoginModal();
  };

  const getButtonText = () => {
    if (isConnecting) return 'Connecting...';
    if (needsSignature) return 'Sign message';
    return 'Log in';
  };

  return (
    <div className="flex flex-col items-center justify-center h-full lg:h-screen p-8">
      {/* Hidden image to preload */}
      <img 
        src={assistantAvatar} 
        alt="" 
        className="hidden"
        onLoad={() => setImageLoaded(true)}
      />
      
      {showSkeleton ? (
        <>
          <div className="w-20 h-20 mb-6 rounded-full bg-zinc-800 animate-pulse" />
          <div className="h-6 w-40 bg-zinc-800 rounded animate-pulse mb-2" />
          <div className="h-4 w-64 bg-zinc-800 rounded animate-pulse mb-6" />
          <div className="h-10 w-24 bg-zinc-800 rounded-xl animate-pulse" />
        </>
      ) : (
        <>
          <img 
           src={assistantAvatar} 
            alt="Log in" 
            className="w-20 h-20 object-contain mb-6 mt-[10px]"
          />
          <h2 className="text-xl font-semibold text-white mb-2">Log in required</h2>
          <p className="text-white/60 text-center mb-6 max-w-sm">
            {description}
          </p>
          <Button 
            onClick={handleLogin}
            disabled={isConnecting}
            variant="glass"
            className="rounded-xl font-semibold px-6 min-w-[120px]"
          >
            {isConnecting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
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
