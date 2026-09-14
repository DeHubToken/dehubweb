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
  Crab: { scale: 1, bottomInset: 8 },
  Lobster: { scale: 1.04, bottomInset: 7 },
  Piranha: { scale: 1, bottomInset: 8 },
  Tortoise: { scale: 1, bottomInset: 11 },
  Cobra: { scale: 1, bottomInset: 6 },
  Octopus: { scale: 1.02, bottomInset: 7 },
  Crocodile: { scale: 1, bottomInset: 11 },
  Dolphin: { scale: 1.03, bottomInset: 7 },
  'Tiger Shark': { scale: 1.03, bottomInset: 6 },
  'Killer Whale': { scale: 1.04, bottomInset: 6 },
  'Great White Shark': { scale: 1.04, bottomInset: 8 },
  'Blue Whale': { scale: 1.1, bottomInset: 6 },
  Megalodon: { scale: 1.08, bottomInset: 10 },
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
  const renderedSize = 1.2 * (optics?.scale ?? 1);
  // The artwork uses a 128px transparent canvas with a measured transparent
  // margin of six to eleven pixels on every side. The base size is a touch
  // larger than the previous edge-tight exports needed, so the visible mark
  // keeps the same footprint beside a name. Baseline-align the image box,
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
    display: 'inline-block',
    top: `calc(${artworkBaselineOffset}em + ${ARTWORK_GUTTER_PX}px)`,
  };
  if (!url) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          style={opticalStyle}
          className={`shrink-0 self-baseline align-baseline cursor-pointer ${className}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            navigate('/app/glossary#badges');
          }}
        >
          {/* A blurred, blacked-out copy of the same image sits behind the
              artwork as a soft halo. The silver and chrome tiers are drawn as
              light strokes on transparency and dissolve against a light theme's
              background; the halo gives them a dark ground to sit on. On the
              dark themes it is a dark blur on a dark page — invisible. */}
          <img aria-hidden alt="" src={url} className="art-halo" style={{ inset: `${ARTWORK_GUTTER_PX}px` }} />
          <img
            data-badge-icon
            src={url}
            alt={visualName || 'Badge'}
            width={16}
            height={16}
            loading="lazy"
            decoding="async"
            className="relative block w-full h-full rounded-none bg-transparent object-contain hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)] transition-all"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs capitalize">
        {visualName || 'Badge'}
      </TooltipContent>
    </Tooltip>
  );
}
