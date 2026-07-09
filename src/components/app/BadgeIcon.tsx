/**
 * BadgeIcon — Reusable staking badge image with tooltip and click-to-glossary.
 */
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getBadgeName, getBadgeUrl, isBigBadge, isBigBadgeUrl } from '@/lib/staking-badges';

interface BadgeIconProps {
  /** Pass badgeBalance to resolve badge from balance */
  badgeBalance?: number | string | null;
  /** Username for override lookup */
  username?: string | null;
  /** Or pass a pre-resolved badgeUrl directly */
  src?: string | null;
  /** Extra classes (positioning, sizing) */
  className?: string;
}

export function BadgeIcon({ badgeBalance, username, src, className = 'w-[9px] h-[9px]' }: BadgeIconProps) {
  const navigate = useNavigate();
  const resolvedUrl = src || getBadgeUrl(badgeBalance, username);
  const resolvedName = getBadgeName(badgeBalance, username);
  const big = src ? isBigBadgeUrl(src) : isBigBadge(badgeBalance, username);

  if (!resolvedUrl) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <img
          data-badge-icon
          src={resolvedUrl}
          alt={resolvedName || 'Badge'}
          width={9}
          height={9}
          loading="lazy"
          decoding="async"
          className={`shrink-0 brightness-0 invert cursor-pointer hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)] transition-all ${big ? 'scale-110' : ''} ${className}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            navigate('/app/glossary#badges');
          }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs capitalize">
        {resolvedName || 'Badge'}
      </TooltipContent>
    </Tooltip>
  );
}
