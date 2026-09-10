/**
 * BadgeIcon — Reusable staking badge image with tooltip and click-to-glossary.
 */
import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBadgeVisual } from '@/hooks/use-badge-balance';
import type { BadgeLock } from '@/lib/staking-badges';

interface BadgeIconProps {
  /** Pass badgeBalance to resolve badge from balance */
  badgeBalance?: number | string | null;
  /** Username for override lookup */
  username?: string | null;
  /**
   * Username or wallet address to fetch the balance for, when the surrounding
   * payload carries no badge data (stage hosts, community owners, advertisers).
   * Ignored when `badgeBalance` or `src` is supplied.
   */
  lookupId?: string | null;
  /**
   * The holder's grandfathered tier, when the payload carries one. A provided
   * `badgeBalance` skips the account lookup, so a feed card has to pass this
   * for the badge to reflect a tier the live ladder no longer grants.
   */
  badgeLock?: BadgeLock | null;
  /** Or pass a pre-resolved badgeUrl directly */
  src?: string | null;
  /** Extra classes (positioning, sizing) */
  className?: string;
}

/**
 * The artwork is intentionally irregular, so its visible check mark does not
 * share the PNG/WebP box's centre or scale. These per-tier corrections align
 * the check itself with the adjacent text rather than aligning transparent
 * pixels around it. Lobster is the neutral reference; darker wide marks get a
 * little more optical size so they do not recede at compact rendering sizes.
 */
const BADGE_OPTICS: Record<string, number> = {
  Crab: 1,
  Lobster: 1.04,
  Piranha: 1,
  Tortoise: 1,
  Cobra: 1,
  Octopus: 1.02,
  Crocodite: 1,
  Dolphin: 1.03,
  'Tiger Shark': 1.03,
  'Killer Whale': 1.04,
  'Great White Shark': 1.04,
  'Blue Whale': 1.1,
  Meglodon: 1.08,
};

export function BadgeIcon({ badgeBalance, username, lookupId, badgeLock, src, className = 'w-[1em] h-[1em]' }: BadgeIconProps) {
  const navigate = useNavigate();
  const { url, name } = useBadgeVisual({ badgeBalance, username, lookupId, badgeLock, src });
  const opticalScale = name ? BADGE_OPTICS[name] : undefined;
  const opticalStyle: CSSProperties = {
    width: '1.15em',
    height: '1.15em',
    marginInlineStart: '0.125em',
    transform: `translateY(-1px) scale(${opticalScale ?? 1})`,
    transformOrigin: 'center',
  };

  if (!url) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <img
          data-badge-icon
          src={url}
          alt={name || 'Badge'}
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
          style={opticalStyle}
          className={`shrink-0 self-center align-middle rounded-none bg-transparent object-contain cursor-pointer hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)] transition-all ${className}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            navigate('/app/glossary#badges');
          }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs capitalize">
        {name || 'Badge'}
      </TooltipContent>
    </Tooltip>
  );
}
