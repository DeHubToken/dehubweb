/**
 * Auth Prompt Component
 * ======================
 * Opens the custom LoginModal for authentication.
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
  const { openLoginModal, isAuthenticated } = useAuth();
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (isOpen && !isAuthenticated && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      // Open the custom login modal
      openLoginModal();
      onClose();
    }
  }, [isOpen, isAuthenticated, openLoginModal, onClose]);

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
  const { isAuthenticated, openLoginModal } = useAuth();

  const requireAuth = useCallback((callback?: () => void) => {
    if (isAuthenticated) {
      callback?.();
      return true;
    }
    // Directly open the login modal
    openLoginModal();
    return false;
  }, [isAuthenticated, openLoginModal]);

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
