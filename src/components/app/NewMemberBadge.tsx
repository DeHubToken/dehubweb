/**
 * NewMemberBadge Component
 * ========================
 * A temporary "New" chip on a recently joined account, so existing members can
 * spot a newcomer and welcome them.
 *
 * Renders nothing unless the account is inside the new-member window and its
 * owner has not opted out. Both checks live here rather than at each call site,
 * so a new placement cannot forget the opt-out.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProfilePreferences } from '@/hooks/use-profile-preferences';
import { isNewMember, newMemberLabel } from '@/lib/new-member';
import { cn } from '@/lib/utils';

interface NewMemberBadgeProps {
  /** The account being displayed — needs its createdAt and wallet address. */
  account: {
    address?: string;
    wallet_address?: string;
    createdAt?: string | null;
    created_at?: string | null;
  } | null | undefined;
  className?: string;
}

export function NewMemberBadge({ account, className }: NewMemberBadgeProps) {
  const wallet = account?.address ?? account?.wallet_address;
  // Fetched even when the badge will not show, because the hook must not change
  // call order between renders — the query is cheap and cached for five minutes.
  const { data: preferences } = useProfilePreferences(wallet);

  if (!account || !isNewMember(account)) return null;
  if (preferences?.hideNewMemberBadge) return null;

  const label = newMemberLabel(account) ?? 'Recently joined';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center shrink-0 rounded-lg border px-1.5 py-0.5',
            'text-[10px] font-semibold uppercase tracking-wide',
            'border-emerald-300/25 bg-emerald-400/15 text-emerald-300/90',
            className,
          )}
        >
          New
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
