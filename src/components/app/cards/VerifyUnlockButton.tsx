/**
 * Verify & Unlock Button for gated content drawers.
 * Checks cached DHB balance from DeHub API profile on click.
 */
import { ShieldCheck } from 'lucide-react';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { useVerifyUnlock } from '@/hooks/use-verify-unlock';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';

interface VerifyUnlockButtonProps {
  requiredAmount: number;
  currency: string;
  onUnlocked: () => void;
}

export function VerifyUnlockButton({ requiredAmount, currency, onUnlocked }: VerifyUnlockButtonProps) {
  const { walletAddress, openLoginModal } = useAuth();
  const { insufficientMessage, verifyAndUnlock, resetMessage } = useVerifyUnlock();
  const { data: profile } = useDeHubProfile({ userId: walletAddress, enabled: !!walletAddress });

  const handleClick = () => {
    if (!walletAddress) {
      openLoginModal();
      return;
    }
    const balance = profile?.badgeBalance ?? 0;
    const success = verifyAndUnlock(balance, requiredAmount, currency);
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
          <ShieldCheck className="w-4 h-4" />
          Verify & Unlock
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
