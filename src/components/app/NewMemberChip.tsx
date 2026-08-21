/**
 * New Member Chip
 * ===============
 * The temporary "New here" marker beside a name, for the first
 * NEW_MEMBER_WINDOW_DAYS after an account is created.
 *
 * Renders nothing at all when the person is not new, or has opted out — the
 * opt-out case is indistinguishable from the not-new case on purpose, because
 * RLS never returns the row and there is nothing here to leak.
 *
 * @module components/app/NewMemberChip
 */

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { joinedAgoLabel, useIsNewMember } from '@/hooks/use-new-members';

interface NewMemberChipProps {
  /** Wallet address of the profile being viewed. */
  address?: string | null;
  className?: string;
}

export function NewMemberChip({ address, className }: NewMemberChipProps) {
  const { isNew, joinedAt } = useIsNewMember(address);

  if (!isNew || !joinedAt) return null;

  return (
    <span
      title={`Joined ${joinedAgoLabel(joinedAt)} — say hello`}
      className={cn(
        'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md',
        'bg-white/10 text-white border border-white/15 whitespace-nowrap',
        className,
      )}
    >
      <Sparkles className="w-3 h-3" />
      New here
    </span>
  );
}
