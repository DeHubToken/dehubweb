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
const BADGE_OPTICS: Record<string, { scale: number; bottomInset: number }> = {
  Crab: { scale: 1, bottomInset: 5 },
  Lobster: { scale: 1.04, bottomInset: 4 },
  Piranha: { scale: 1, bottomInset: 7 },
  Tortoise: { scale: 1, bottomInset: 10 },
  Cobra: { scale: 1, bottomInset: 4 },
  Octopus: { scale: 1.02, bottomInset: 4 },
  Crocodite: { scale: 1, bottomInset: 10 },
  Dolphin: { scale: 1.03, bottomInset: 4 },
  'Tiger Shark': { scale: 1.03, bottomInset: 5 },
  'Killer Whale': { scale: 1.04, bottomInset: 6 },
  'Great White Shark': { scale: 1.04, bottomInset: 4 },
  'Blue Whale': { scale: 1.1, bottomInset: 11 },
  Meglodon: { scale: 1.08, bottomInset: 4 },
};

// At compact sizes the source artwork's narrowest transparent edge is less
// than one rendered pixel. Give every badge a full CSS pixel of protected
// internal space so anti-aliased details cannot be sampled against the image
// boundary. The content box remains the same size, so this does not shrink the
// artwork users see.
const ARTWORK_GUTTER_PX = 1;

function badgeNameFromAssetUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    // A malformed external URL can still render; it simply gets neutral optics.
  }
  return Object.keys(BADGE_OPTICS).find((tier) => decodedUrl.includes(tier));
}

export function BadgeIcon({ badgeBalance, username, lookupId, badgeLock, src, className = 'w-[1em] h-[1em]' }: BadgeIconProps) {
  const navigate = useNavigate();
  const { url, name } = useBadgeVisual({ badgeBalance, username, lookupId, badgeLock, src });
  // Profiles already hold a resolved asset URL. Recover its tier so the same
  // size and measured artwork inset still apply there as everywhere else.
  const visualName = name ?? badgeNameFromAssetUrl(url);
  const optics = visualName ? BADGE_OPTICS[visualName] : undefined;
  const renderedSize = 1.15 * (optics?.scale ?? 1);
  // The artwork uses a 128px transparent canvas. Baseline-align the image box,
  // then lower it only by its measured transparent bottom inset so the badge's
  // visible mark — not the canvas edge — finishes exactly on the text baseline.
  const artworkBaselineOffset = ((optics?.bottomInset ?? 0) / 128) * renderedSize;
  const opticalStyle: CSSProperties = {
    width: `calc(${renderedSize}em + ${ARTWORK_GUTTER_PX * 2}px)`,
    height: `calc(${renderedSize}em + ${ARTWORK_GUTTER_PX * 2}px)`,
    padding: `${ARTWORK_GUTTER_PX}px`,
    boxSizing: 'border-box',
    marginInlineStart: '0.125em',
    position: 'relative',
    top: `calc(${artworkBaselineOffset}em + ${ARTWORK_GUTTER_PX}px)`,
  };

  if (!url) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <img
          data-badge-icon
          src={url}
          alt={visualName || 'Badge'}
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
          style={opticalStyle}
          className={`shrink-0 self-baseline align-baseline rounded-none bg-transparent object-contain cursor-pointer hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)] transition-all ${className}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            navigate('/app/glossary#badges');
          }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs capitalize">
        {visualName || 'Badge'}
      </TooltipContent>
    </Tooltip>
  );
}
