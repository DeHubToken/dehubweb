/**
 * BadgedName — a display name with its staking badge inline beside it.
 *
 * It follows the familiar social verification pattern: one text-em square,
 * immediately after the display name and aligned to its baseline.
 *
 * Pass `badgeBalance` when the payload carries one (feed cards), or `lookupId`
 * — a username or wallet address — when it does not (stage hosts, community
 * owners, advertisers).
 */

import { cn } from '@/lib/utils';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import type { BadgeLock } from '@/lib/staking-badges';

interface BadgedNameProps {
  /** The name text. */
  children: React.ReactNode;
  badgeBalance?: number | string | null;
  /** Username or address to resolve the balance from, when none was passed. */
  lookupId?: string | null;
  /** Username for the badge override table. */
  username?: string | null;
  /**
   * The holder's grandfathered tier, when the payload carries one. Pass it
   * alongside `badgeBalance` — a provided balance skips the account lookup, so
   * without this the badge falls back to the live ladder for that name.
   */
  badgeLock?: BadgeLock | null;
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
  badgeLock,
  className,
  wrapperClassName,
}: BadgedNameProps) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 shrink min-w-0 max-w-full',
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
        badgeLock={badgeLock}
        className="w-[1em] h-[1em]"
      />
    </span>
  );
}

export default BadgedName;
