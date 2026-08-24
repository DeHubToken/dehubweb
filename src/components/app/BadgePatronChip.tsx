/**
 * Badge Patron Chip
 * =================
 * "Lent by @someone", revealed on hover over a badge that was delegated rather
 * than earned.
 *
 * A lent badge draws identically to an earned one everywhere on the site —
 * that is deliberate, it is the same influence — so this is the one place that
 * says where it came from, and it stays out of the way until asked. Two things
 * still follow from it existing: a delegation is something to show off rather
 * than hide, and there is a trail when somebody starts handing badges to spam
 * accounts.
 *
 * **Render it inside a `group relative` parent**, alongside the thing being
 * explained — the badge, or the name the badge sits on. It positions itself
 * above that parent and appears on `group-hover`.
 *
 * Renders nothing for the overwhelming majority of accounts, whose badge is
 * their own. One cached lookup per account, shared across every instance on a
 * page.
 *
 * @module components/app/BadgePatronChip
 */

import { useQuery } from '@tanstack/react-query';
import { badgeImage } from '@/lib/staking-badges';
import { cn } from '@/lib/utils';
import { fetchBadgePatron } from '@/lib/api/dehub/badges';

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
  const who = handle ? `@${handle}` : 'another holder';

  return (
    <span
      // `title` rather than a link: this is a hover affordance, and a tooltip
      // you have to hover to see is not somewhere to put a click target. It
      // also gives touch and screen readers the one thing worth having here,
      // which `group-hover` alone would never reach.
      title={`This ${tier} badge was lent by ${who}`}
      role="note"
      className={cn(
        'pointer-events-none absolute bottom-full left-0 z-20 mb-1 flex items-center gap-1',
        'whitespace-nowrap rounded-md border border-white/15 bg-zinc-900/95 px-2 py-0.5',
        'text-xs text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-150',
        'group-hover:opacity-100',
        className,
      )}
    >
      {src ? <img src={src} alt="" className="size-3 shrink-0" /> : null}
      Lent by {who}
    </span>
  );
}
