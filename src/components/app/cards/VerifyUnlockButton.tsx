/**
 * Verify & Unlock Button for gated content drawers.
 * Shows a glass button that checks DHB balance on click.
 */
import { Loader2, ShieldCheck } from 'lucide-react';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { useVerifyUnlock } from '@/hooks/use-verify-unlock';
import { useAuth } from '@/contexts/AuthContext';

interface VerifyUnlockButtonProps {
  requiredAmount: number;
  currency: string;
  onUnlocked: () => void;
}

export function VerifyUnlockButton({ requiredAmount, currency, onUnlocked }: VerifyUnlockButtonProps) {
  const { walletAddress, openLoginModal } = useAuth();
  const { isVerifying, insufficientMessage, verifyAndUnlock, resetMessage } = useVerifyUnlock();

  const handleClick = async () => {
    if (!walletAddress) {
      openLoginModal();
      return;
    }
    const success = await verifyAndUnlock(walletAddress, requiredAmount, currency);
    if (success) {
      onUnlocked();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <LiquidGlassBubble
        onClick={handleClick}
        className="w-full py-3 cursor-pointer"
      >
        <span className="flex items-center justify-center gap-2 text-white text-sm font-medium">
          {isVerifying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking balance...
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Verify & Unlock
            </>
          )}
        </span>
      </LiquidGlassBubble>
      {insufficientMessage && (
        <p className="text-center text-red-400 text-xs">
          {insufficientMessage}
        </p>
      )}
    </div>
  );
}
