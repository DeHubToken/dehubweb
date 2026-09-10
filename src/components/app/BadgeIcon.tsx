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
 * little more optical size so they do not recede at one-em rendering sizes.
 */
const BADGE_OPTICS: Record<string, { scale: number; y: string }> = {
  Crab: { scale: 1.02, y: '-0.07em' },
  Lobster: { scale: 1.08, y: '-0.08em' },
  Piranha: { scale: 1.03, y: '-0.05em' },
  Tortoise: { scale: 1.02, y: '-0.04em' },
  Cobra: { scale: 1.02, y: '-0.07em' },
  Octopus: { scale: 1.04, y: '-0.06em' },
  Crocodite: { scale: 1.03, y: '-0.04em' },
  Dolphin: { scale: 1.07, y: '-0.05em' },
  'Tiger Shark': { scale: 1.06, y: '-0.05em' },
  'Killer Whale': { scale: 1.08, y: '-0.05em' },
  'Great White Shark': { scale: 1.07, y: '-0.05em' },
  'Blue Whale': { scale: 1.16, y: '0.02em' },
  Meglodon: { scale: 1.12, y: '-0.01em' },
};

export function BadgeIcon({ badgeBalance, username, lookupId, badgeLock, src, className = 'w-[1em] h-[1em]' }: BadgeIconProps) {
  const navigate = useNavigate();
  const { url, name } = useBadgeVisual({ badgeBalance, username, lookupId, badgeLock, src });
  const optics = name ? BADGE_OPTICS[name] : undefined;
  const opticalStyle: CSSProperties = {
    marginInlineStart: '0.125em',
    transform: `translateY(${optics?.y ?? '-0.05em'}) scale(${optics?.scale ?? 1.04})`,
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
          className={`shrink-0 self-end align-middle rounded-none bg-transparent object-contain cursor-pointer hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)] transition-all ${className}`}
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
