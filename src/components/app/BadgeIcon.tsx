/**
 * BadgeIcon — Reusable staking badge image with tooltip and click-to-glossary.
 */
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBadgeVisual } from '@/hooks/use-badge-balance';

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
  /** Or pass a pre-resolved badgeUrl directly */
  src?: string | null;
  /** Extra classes (positioning, sizing) */
  className?: string;
}

export function BadgeIcon({ badgeBalance, username, lookupId, src, className = 'w-[9px] h-[9px]' }: BadgeIconProps) {
  const navigate = useNavigate();
  const { url, name, big } = useBadgeVisual({ badgeBalance, username, lookupId, src });

  if (!url) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <img
          data-badge-icon
          src={url}
          alt={name || 'Badge'}
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
        {name || 'Badge'}
      </TooltipContent>
    </Tooltip>
  );
}
