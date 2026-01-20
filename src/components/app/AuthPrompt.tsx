/**
 * Auth Prompt Component
 * ======================
 * Directly triggers Web3Auth modal for authentication.
 * 
 * @module components/app/AuthPrompt
 */

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface AuthPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthPrompt({ isOpen, onClose }: AuthPromptProps) {
  const { connect, isConnecting, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isOpen && !isAuthenticated && !isConnecting) {
      // Directly trigger Web3Auth modal
      connect()
        .then(() => {
          onClose();
        })
        .catch((error) => {
          console.error('Connection failed:', error);
          onClose();
        });
    }
  }, [isOpen, isAuthenticated, isConnecting, connect, onClose]);

  // Close when authenticated
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      onClose();
    }
  }, [isAuthenticated, isOpen, onClose]);

  // Show loading overlay while connecting
  if (isConnecting) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-zinc-900/90">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
          <p className="text-white font-medium">Connecting...</p>
        </div>
      </div>
    );
  }

  return null;
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
