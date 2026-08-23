/**
 * New Member Chip
 * ===============
 * The temporary "New here" marker beside a name, for the first
 * NEW_MEMBER_WINDOW_DAYS after an account is created. Profile header, feed
 * cards, comments, quotes, repost lists, hovercards, DMs — anywhere a name is
 * drawn, this sits beside it.
 *
 * Renders nothing at all when the person is not new, or has opted out — the
 * opt-out case is indistinguishable from the not-new case on purpose, because
 * RLS never returns the row and there is nothing here to leak.
 *
 * Membership is checked against one shared window read (useNewMemberSet), so a
 * page of cards costs no more than the profile did. Pass `address` when the
 * payload carries one; pass `lookupId` — username or address, same thing the
 * BadgedName beside you resolves — when it does not, and the account row that
 * lookup already fetched supplies the address for free.
 *
 * @module components/app/NewMemberChip
 */

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { joinedAgoLabel, useIsNewMember } from '@/hooks/use-new-members';
import { useBadgeBalance } from '@/hooks/use-badge-balance';

interface NewMemberChipProps {
  /** Wallet address of the person being drawn. */
  address?: string | null;
  /** Username or address to resolve when the payload carries no address. */
  lookupId?: string | null;
  className?: string;
}

export function NewMemberChip({ address, lookupId, className }: NewMemberChipProps) {
  const looked = useBadgeBalance(address ? null : lookupId);
  const resolved = address || looked.address || null;
  const { isNew, joinedAt } = useIsNewMember(resolved);

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
      <Star className="w-3 h-3" />
      New here
    </span>
  );
}
