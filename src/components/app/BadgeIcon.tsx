/**
 * BadgeIcon — Reusable staking badge image with tooltip. A click opens the
 * badge showcase, flying the badge out of this spot.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { badgeAnimationStyle } from '@/lib/badge-animation-style';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBadgeVisual } from '@/hooks/use-badge-balance';
import { type BadgeLock } from '@/lib/staking-badges';
import { openBadgeShowcase, preloadBadgeShowcase } from '@/lib/badge-showcase';
import { badgeHoverArt } from '@/lib/badge-hover-art';
import { useMediaQuery } from '@/hooks/use-media-query';

let idleWarmupScheduled = false;

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

// Visible artwork bounds on the 128px canvas, measured at alpha > 16.
const BADGE_OPTICS: Record<string, { left: number; top: number; right: number; bottom: number }> = {
  "Crab": { left: 9, top: 16, right: 120, bottom: 118 },
  "Ghost Lobster": { left: 16, top: 14, right: 112, bottom: 111 },
  "Piranha": { left: 7, top: 11, right: 120, bottom: 119 },
  "Giant Tortoise": { left: 8, top: 16, right: 119, bottom: 114 },
  "King Cobra": { left: 15, top: 8, right: 111, bottom: 119 },
  "Octopus": { left: 10, top: 14, right: 118, bottom: 120 },
  "Crocodile": { left: 8, top: 12, right: 121, bottom: 117 },
  "Dolphin": { left: 15, top: 12, right: 111, bottom: 120 },
  "Tiger Shark": { left: 8, top: 15, right: 120, bottom: 120 },
  "Killer Whale": { left: 19, top: 17, right: 109, bottom: 121 },
  "Great White Shark": { left: 8, top: 13, right: 121, bottom: 120 },
  "Blue Whale": { left: 7, top: 13, right: 119, bottom: 121 },
  "Megalodon": { left: 8, top: 15, right: 120, bottom: 117 },
};

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
  const { url, name } = useBadgeVisual({ badgeBalance, username, lookupId, badgeLock, src });
  // Profiles already hold a resolved asset URL. Recover its tier so the same
  // size and measured artwork inset still apply there as everywhere else.
  const visualName = name ?? badgeNameFromAssetUrl(url);
  const art = badgeHoverArt(visualName);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [failedAnimation, setFailedAnimation] = useState<string | null>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const active = hovered || focused;
  const playing = active && !reducedMotion && art && failedAnimation !== art.animation;
  const { theme } = useAppTheme();
  const metallic = badgeAnimationStyle(theme) === 'metallic';
  const warmShowcase = () => { void preloadBadgeShowcase(metallic ? visualName : undefined).catch(() => {}); };
  useEffect(() => {
    if (!metallic || !visualName || idleWarmupScheduled) return;
    idleWarmupScheduled = true;
    // The first inline badge primes one renderer while the feed is idle.
    const warm = () => { void preloadBadgeShowcase(visualName, false).catch(() => { idleWarmupScheduled = false; }); };
    if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 1800 });
    else setTimeout(warm, 800);
  }, [metallic, visualName]);
  const optics = art?.bounds ?? (visualName ? BADGE_OPTICS[visualName] : undefined);
  const bounds = optics ?? { left: 0, top: 0, right: 128, bottom: 128 };
  const artworkHeight = bounds.bottom - bounds.top;
  // CSS cap follows the actual adjacent font; use 0.72em on older engines.
  const cap = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('height', '1cap') ? '1cap' : '0.72em';
  const opticalStyle: CSSProperties = {
    width: `calc(${(bounds.right - bounds.left) / artworkHeight} * ${cap})`,
    height: cap,
    position: 'relative',
    display: 'inline-block',
    marginInlineStart: 0,
    overflow: 'visible',
  };
  const imageStyle: CSSProperties = {
    position: 'absolute',
    maxWidth: 'none',
    width: `calc(${128 / artworkHeight} * ${cap})`,
    height: `calc(${128 / artworkHeight} * ${cap})`,
    left: `calc(${-bounds.left / artworkHeight} * ${cap})`,
    top: `calc(${-bounds.top / artworkHeight} * ${cap})`,
  };

  if (!url) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          style={opticalStyle}
          className={`shrink-0 self-baseline align-baseline cursor-pointer ${className}`}
          role="button"
          tabIndex={0}
          aria-label={visualName || 'Badge'}
          data-badge-playing={playing ? 'true' : 'false'}
          onPointerEnter={(e) => {
            warmShowcase();
            if (e.pointerType !== 'touch') setHovered(true);
          }}
          onPointerLeave={() => setHovered(false)}
          onTouchStart={warmShowcase}
          onFocus={() => { warmShowcase(); setFocused(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.stopPropagation();
            e.preventDefault();
            openBadgeShowcase(visualName ?? null, e.currentTarget);
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            openBadgeShowcase(visualName ?? null, e.currentTarget);
          }}
        >
          <img
            key={playing ? art.animation : 'poster'}
            style={imageStyle}
            data-badge-icon
            src={playing ? art.animation : art?.poster ?? url}
            onError={() => { if (playing) setFailedAnimation(art.animation); }}
            alt={visualName || 'Badge'}
            width={16}
            height={16}
            loading="lazy"
            decoding="async"
            className={`relative block w-full h-full rounded-none bg-transparent object-contain transition-[filter] ${active ? 'drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]' : ''}`}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs capitalize">
        {visualName || 'Badge'}
      </TooltipContent>
    </Tooltip>
  );
}
