import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useStreamerProgress } from '@/hooks/use-streamer-progress';
import { openStreamerShowcase, preloadStreamerShowcase } from '@/lib/badge-showcase';
import { streamerBadgeBounds, streamerBadgeSvg } from '@/lib/streamer-badge-art';
import { useInlineBadgeFont } from '@/hooks/use-inline-badge-font';
import { cn } from '@/lib/utils';

interface StreamerBadgeProps {
  address?: string | null;
  canSelect?: boolean;
  className?: string;
}

export function StreamerBadge({ address, canSelect = false, className }: StreamerBadgeProps) {
  const { data } = useStreamerProgress(address);
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const instance = useId();
  const badgeRef = useInlineBadgeFont<HTMLButtonElement>();
  const equipped = data?.cards.find((card) => card.id === data.selectedBadgeId && card.earnedAt);

  if (!address || !data || !(data.totalStreams > 0) || !equipped) return null;

  const label = t(`live.progress.card.${equipped.id}.name`);
  const warmShowcase = () => { preloadStreamerShowcase().catch(() => {}); };
  const bounds = streamerBadgeBounds(equipped.id, theme);
  const height = bounds.bottom - bounds.top;
  const cap = typeof CSS !== 'undefined' && CSS.supports?.('height', '1cap') ? '1.1cap' : '0.8052em';

  return (
    <button
      type="button"
      ref={badgeRef}
      data-streamer-badge
      style={{ width: `calc(${(bounds.right - bounds.left) / height} * ${cap})`, height: cap, position: 'relative', overflow: 'visible', verticalAlign: 'baseline', lineHeight: 0 }}
      aria-label={label}
      title={label}
      className={cn('inline-block shrink-0 self-baseline align-baseline rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60', className)}
      onPointerEnter={warmShowcase}
      onFocus={warmShowcase}
      onClick={(event) => openStreamerShowcase(equipped.id, address, canSelect, event.currentTarget)}
    >
      <span style={{ position: 'absolute', width: `calc(${120 / height} * ${cap})`, height: `calc(${120 / height} * ${cap})`, left: `calc(${-bounds.left / height} * ${cap})`, top: `calc(${-bounds.top / height} * ${cap})` }}
        className="[&>svg]:w-full [&>svg]:h-full" aria-hidden
        dangerouslySetInnerHTML={{ __html: streamerBadgeSvg(equipped.id, theme, true, instance, 'compact') }} />
    </button>
  );
}
