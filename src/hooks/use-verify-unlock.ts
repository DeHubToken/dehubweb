/**
 * Hook for real-time DHB balance verification to unlock gated content.
 * Calls the get-badge-balance edge function and checks against required amount.
 */
import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface VerifyUnlockResult {
  isVerifying: boolean;
  insufficientMessage: string | null;
  verifyAndUnlock: (walletAddress: string, requiredAmount: number, currency: string) => Promise<boolean>;
  resetMessage: () => void;
}

export function useVerifyUnlock(): VerifyUnlockResult {
  const [isVerifying, setIsVerifying] = useState(false);
  const [insufficientMessage, setInsufficientMessage] = useState<string | null>(null);

  const resetMessage = useCallback(() => setInsufficientMessage(null), []);

  const verifyAndUnlock = useCallback(async (
    walletAddress: string,
    requiredAmount: number,
    currency: string,
  ): Promise<boolean> => {
    setIsVerifying(true);
    setInsufficientMessage(null);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/get-badge-balance?address=${walletAddress}`,
        { headers: { 'apikey': anonKey } }
      );

      if (!res.ok) throw new Error('Balance check failed');

      const json = await res.json();
      const balance = json.badgeBalance ?? 0;

      if (balance >= requiredAmount) {
        toast.success('Content unlocked! 🎉');
        return true;
      } else {
        const shortfall = requiredAmount - balance;
        setInsufficientMessage(
          `Your balance: ${Math.floor(balance).toLocaleString()} ${currency}. Need ${Math.floor(shortfall).toLocaleString()} more.`
        );
        return false;
      }
    } catch (err) {
      console.error('[verify-unlock] Error:', err);
      toast.error('Failed to verify balance. Try again.');
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  return { isVerifying, insufficientMessage, verifyAndUnlock, resetMessage };
}
