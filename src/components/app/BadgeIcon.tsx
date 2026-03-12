/**
 * BadgeIcon — Reusable staking badge image with tooltip and click-to-glossary.
 */
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getBadgeName, getBadgeUrl, isBigBadge } from '@/lib/staking-badges';

interface BadgeIconProps {
  badgeBalance: number | string | undefined | null;
  username?: string | null;
  className?: string;
}

export function BadgeIcon({ badgeBalance, username, className = 'w-[9px] h-[9px]' }: BadgeIconProps) {
  const navigate = useNavigate();
  const badgeUrl = getBadgeUrl(badgeBalance, username);
  const badgeName = getBadgeName(badgeBalance, username);
  const big = isBigBadge(badgeBalance, username);

  if (!badgeUrl || !badgeName) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <img
          src={badgeUrl}
          alt={badgeName}
          className={`shrink-0 brightness-0 invert cursor-pointer hover:scale-125 transition-transform ${big ? 'scale-110' : ''} ${className}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            navigate('/app/glossary#badges');
          }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs capitalize">
        {badgeName}
      </TooltipContent>
    </Tooltip>
  );
}
