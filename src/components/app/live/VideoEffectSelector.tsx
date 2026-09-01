/**
 * VideoEffectSelector — the look picker for the Go Live broadcaster.
 *
 * A pill grid, matching VoiceEffectSelector on the panel beside it, plus the
 * system background blur where the platform offers it. That toggle sits here
 * rather than in the grid because it is not one of our looks: it runs on the
 * camera itself, survives being composited, and is the only thing on this
 * panel that can separate a person from their room.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  VIDEO_EFFECTS,
  type VideoEffectId,
} from '@/constants/video-effects.constants';
import { canvasFiltersSupported } from '@/lib/livepeer/video-effects';

interface VideoEffectSelectorProps {
  activeEffect: VideoEffectId;
  onSelect: (id: VideoEffectId) => void;
  /** null where the camera or platform cannot do it — the row is then hidden. */
  backgroundBlur: boolean | null;
  onToggleBackgroundBlur: () => void;
}

export function VideoEffectSelector({
  activeEffect,
  onSelect,
  backgroundBlur,
  onToggleBackgroundBlur,
}: VideoEffectSelectorProps) {
  const { t } = useTranslation();
  const filtersOk = canvasFiltersSupported();
  const looks = VIDEO_EFFECTS.filter((look) => filtersOk || !look.needsCanvasFilter);

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium text-white/60">
        🎨 {t('videoLooks.title')}
      </h3>

      <div className="flex flex-wrap gap-1.5">
        {looks.map((look) => (
          <button
            key={look.id}
            onClick={() => onSelect(look.id)}
            aria-pressed={activeEffect === look.id}
            className={cn(
              'rounded-xl border px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-all',
              activeEffect === look.id
                ? 'border-white/30 bg-white/20 text-white'
                : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            )}
          >
            <span className="mr-1">{look.emoji}</span>
            {t(`videoLooks.${look.id}`)}
          </button>
        ))}
      </div>

      {backgroundBlur !== null && (
        <button
          onClick={onToggleBackgroundBlur}
          aria-pressed={backgroundBlur}
          className={cn(
            'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-medium backdrop-blur-md transition-all',
            backgroundBlur
              ? 'border-white/30 bg-white/20 text-white'
              : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
          )}
        >
          <span>🪟 {t('videoLooks.backgroundBlur')}</span>
          <span className="text-[11px] text-white/40">
            {backgroundBlur ? t('videoLooks.on') : t('videoLooks.off')}
          </span>
        </button>
      )}
    </div>
  );
}
