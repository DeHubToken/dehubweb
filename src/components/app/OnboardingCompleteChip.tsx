/**
 * "Getting started" chip
 * ======================
 * The recognition for finishing the guided walkthrough, beside your own name
 * on your own profile.
 *
 * Recognition and nothing else, on purpose. There is no off-chain reward
 * ledger to credit, and sending real DHB for ticking seven boxes is both a gas
 * cost per member and an obvious thing to farm with throwaway accounts. So the
 * reward is a chip and a thank-you until there is a ledger worth paying out
 * of.
 *
 * Derived entirely from the viewer's own progress row — there is no field on
 * anybody's profile for this — which is why it only ever draws on your own.
 *
 * @module components/app/OnboardingCompleteChip
 */

import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingChecklistContext';
import { cn } from '@/lib/utils';

interface OnboardingCompleteChipProps {
  /** The wallet whose profile is on screen. */
  address?: string | null;
  className?: string;
}

export function OnboardingCompleteChip({ address, className }: OnboardingCompleteChipProps) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const onboarding = useOnboarding();

  if (!onboarding?.complete || !address || !walletAddress) return null;
  if (address.toLowerCase() !== walletAddress.toLowerCase()) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-white/[0.12] bg-white/[0.12] px-1.5 py-0.5',
        'text-[10px] font-semibold leading-none whitespace-nowrap text-white/75 flex-shrink-0',
        className,
      )}
    >
      <Trophy className="h-2.5 w-2.5" />
      {t('onboarding.checklist.chip')}
    </span>
  );
}
