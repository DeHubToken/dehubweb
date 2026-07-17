/**
 * Hook for DHB balance verification to unlock gated content.
 * Uses the cached badgeBalance from the DeHub API profile instead of calling an edge function.
 */
import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface VerifyUnlockResult {
  isVerifying: boolean;
  insufficientMessage: string | null;
  verifyAndUnlock: (badgeBalance: number, requiredAmount: number, currency: string) => boolean;
  resetMessage: () => void;
}

export function useVerifyUnlock(): VerifyUnlockResult {
  const [isVerifying] = useState(false);
  const [insufficientMessage, setInsufficientMessage] = useState<string | null>(null);

  const resetMessage = useCallback(() => setInsufficientMessage(null), []);

  const verifyAndUnlock = useCallback((
    badgeBalance: number,
    requiredAmount: number,
    currency: string,
  ): boolean => {
    setInsufficientMessage(null);

    if (badgeBalance >= requiredAmount) {
      toast.success('Content unlocked! 🎉');
      return true;
    } else {
      const shortfall = requiredAmount - badgeBalance;
      setInsufficientMessage(
        `Your balance: ${Math.floor(badgeBalance).toLocaleString()} ${currency}. Need ${Math.floor(shortfall).toLocaleString()} more.`
      );
      return false;
    }
  }, []);

  return { isVerifying, insufficientMessage, verifyAndUnlock, resetMessage };
}
