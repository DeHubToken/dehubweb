import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useStreamerProgress } from '@/hooks/use-streamer-progress';
import { openStreamerShowcase, preloadStreamerShowcase } from '@/lib/badge-showcase';
import { streamerBadgeSvg } from '@/lib/streamer-badge-art';
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
  const equipped = data?.cards.find((card) => card.id === data.selectedBadgeId && card.earnedAt);

  if (!address || !data || !(data.totalStreams > 0) || !equipped) return null;

  const label = t(`live.progress.card.${equipped.id}.name`);
  const warmShowcase = () => { preloadStreamerShowcase().catch(() => {}); };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('inline-flex w-[1em] h-[1em] shrink-0 align-middle rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60 [&>svg]:w-full [&>svg]:h-full', className)}
      onPointerEnter={warmShowcase}
      onFocus={warmShowcase}
      onClick={(event) => openStreamerShowcase(equipped.id, address, canSelect, event.currentTarget)}
      dangerouslySetInnerHTML={{ __html: streamerBadgeSvg(equipped.id, theme, true, instance) }}
    />
  );
}
