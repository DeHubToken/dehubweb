/**
 * Auth Prompt Component
 * ======================
 * Directly triggers Web3Auth modal for authentication.
 * 
 * @module components/app/AuthPrompt
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface AuthPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthPrompt({ isOpen, onClose }: AuthPromptProps) {
  const { connect, isConnecting, isAuthenticated } = useAuth();
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (isOpen && !isAuthenticated && !isConnecting && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      // Directly trigger Web3Auth modal
      connect()
        .catch((error) => {
          console.error('Connection failed:', error);
        })
        .finally(() => {
          hasTriggeredRef.current = false;
          onClose();
        });
    }
  }, [isOpen, isAuthenticated, isConnecting, connect, onClose]);

  // Reset ref when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasTriggeredRef.current = false;
    }
  }, [isOpen]);

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
