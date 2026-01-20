/**
 * Auth Prompt Component
 * ======================
 * Reusable modal/drawer for prompting users to connect wallet.
 * 
 * @module components/app/AuthPrompt
 */

import { Wallet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';

interface AuthPromptProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function AuthPrompt({ 
  isOpen, 
  onClose, 
  title = "Connect Your Wallet",
  description = "Sign in with your wallet to access this feature."
}: AuthPromptProps) {
  const { connect, isConnecting } = useAuth();

  const handleConnect = async () => {
    try {
      await connect();
      onClose();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent glass className="px-4 pb-8">
        <DrawerHeader className="text-center">
          <DrawerTitle className="text-white">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
            <Wallet className="w-10 h-10 text-white" />
          </div>
          <p className="text-zinc-400 text-center text-sm max-w-xs">
            {description}
          </p>
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full max-w-xs rounded-full bg-white text-black hover:bg-zinc-200 font-semibold py-6 text-base gap-2"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Wallet className="w-5 h-5" />
                Connect Wallet
              </>
            )}
          </Button>
          <p className="text-zinc-500 text-xs text-center">
            By connecting, you agree to our Terms of Service
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Hook to use auth prompt
 */
import { useState, useCallback } from 'react';

export function useAuthPrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  const requireAuth = useCallback((callback?: () => void) => {
    if (isAuthenticated) {
      callback?.();
      return true;
    }
    setIsOpen(true);
    return false;
  }, [isAuthenticated]);

  const close = useCallback(() => setIsOpen(false), []);

  return {
    isOpen,
    requireAuth,
    close,
    AuthPromptComponent: () => (
      <AuthPrompt isOpen={isOpen} onClose={close} />
    ),
  };
}
