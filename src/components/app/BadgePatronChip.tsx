/**
 * Badge Patron Chip
 * =================
 * "Lent by @someone", beside a name whose badge was delegated rather than
 * earned.
 *
 * A lent badge draws identically to an earned one everywhere on the site —
 * that is deliberate, it is the same influence — so this chip is the one place
 * that says where it came from. Two things follow from putting it here and
 * nowhere else: a delegation becomes something to show off and recruit into
 * rather than something to hide, and there is an audit trail when somebody
 * starts handing badges to spam accounts.
 *
 * Renders nothing for the overwhelming majority of accounts, whose badge is
 * their own. One cached lookup per account, shared across every chip on a
 * page, so a profile costs one request and a feed costs none it was not
 * already making.
 *
 * @module components/app/BadgePatronChip
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchBadgePatron } from '@/lib/api/dehub/badges';
import { badgeImage } from '@/lib/staking-badges';
import { cn } from '@/lib/utils';

interface BadgePatronChipProps {
  /** Username or wallet address of the account being drawn. */
  lookupId?: string | null;
  className?: string;
}

export function BadgePatronChip({ lookupId, className }: BadgePatronChipProps) {
  const { data } = useQuery({
    queryKey: ['badge-patron', lookupId],
    queryFn: () => fetchBadgePatron(lookupId!),
    enabled: Boolean(lookupId),
    // Delegations change rarely, and a stale one is a cosmetic wrong-name
    // rather than a wrong badge — the badge itself comes from badgeBalance.
    staleTime: 10 * 60 * 1000,
    // An account with no patron 200s with a null result, so a failure here is
    // a real error and not worth retrying in front of someone.
    retry: false,
  });

  if (!data?.grantor) return null;

  const { grantor, tier } = data;
  const handle = grantor.username || grantor.displayName || null;
  const src = badgeImage(tier);

  const label = (
    <>
      {src ? <img src={src} alt="" className="size-3 shrink-0" /> : null}
      <span>Lent by {handle ? `@${handle}` : 'another holder'}</span>
    </>
  );

  const classes = cn(
    'inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-white/15',
    'bg-white/10 px-2 py-0.5 text-xs text-white',
    className,
  );

  const title = `This ${tier} badge was lent by ${handle ? `@${handle}` : 'another holder'}`;

  // Not every grantor has a username to route to; those get a plain chip
  // rather than a link to a page that would 404.
  return handle ? (
    <Link to={`/${handle}`} title={title} className={cn(classes, 'transition-colors hover:bg-white/20')}>
      {label}
    </Link>
  ) : (
    <span title={title} className={classes}>
      {label}
    </span>
  );
}
