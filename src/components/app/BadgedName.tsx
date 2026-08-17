/**
 * BadgedName — a display name with its staking badge in the top-right corner.
 *
 * The badge is absolutely positioned so it reads as a superscript rather than
 * pushing the name around, which means the name needs a right gutter — but only
 * when there is actually a badge to sit in it. Every surface used to inline that
 * `getBadgeUrl(...) ? 'pr-3' : ''` test itself; this shares one resolution with
 * the icon so the gutter can never disagree with what renders, including when
 * the balance arrives from a lookup a moment later.
 *
 * Pass `badgeBalance` when the payload carries one (feed cards), or `lookupId`
 * — a username or wallet address — when it does not (stage hosts, community
 * owners, advertisers).
 */

import { cn } from '@/lib/utils';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { useBadgeVisual } from '@/hooks/use-badge-balance';

interface BadgedNameProps {
  /** The name text. */
  children: React.ReactNode;
  badgeBalance?: number | string | null;
  /** Username or address to resolve the balance from, when none was passed. */
  lookupId?: string | null;
  /** Username for the badge override table. */
  username?: string | null;
  /** Classes for the name itself (font, colour, truncation). */
  className?: string;
  /** Classes for the wrapper (layout, max-width). */
  wrapperClassName?: string;
}

export function BadgedName({
  children,
  badgeBalance,
  lookupId,
  username,
  className,
  wrapperClassName,
}: BadgedNameProps) {
  const { url } = useBadgeVisual({ badgeBalance, lookupId, username });

  return (
    <span
      className={cn(
        'relative inline-flex items-baseline shrink min-w-0 max-w-full',
        url && 'pr-3',
        wrapperClassName,
      )}
    >
      {/* min-w-0 so the name can shrink below its content width and actually
          ellipsise — a flex child defaults to min-width:auto and would not. */}
      <span className={cn('truncate min-w-0', className)}>{children}</span>
      <BadgeIcon
        badgeBalance={badgeBalance}
        lookupId={lookupId}
        username={username}
        className="w-[9px] h-[9px] absolute -top-0.5 right-0"
      />
    </span>
  );
}

export default BadgedName;
