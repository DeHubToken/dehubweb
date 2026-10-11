/**
 * The phone live viewer once its chrome is cleared: nothing but the picture
 * and one small rotate button in the corner. A live can't be paused, so the
 * whole frame is the way back: a tap, or a swipe up, brings the chrome back.
 * The app's LiveStreamPlayer draws the same thing.
 */
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';

interface Props {
  onRestore: () => void;
  onRotate: () => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

export function LiveClearedLayer({ onRestore, onRotate, onTouchStart, onTouchEnd }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div
        data-no-navigate
        data-live-restore
        role="button"
        tabIndex={0}
        aria-label={t('liveAudience.showControls', 'Show controls')}
        className="absolute inset-0 z-40"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={(e) => { e.stopPropagation(); onRestore(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') onRestore(); }}
      />
      <button
        type="button"
        data-no-navigate
        data-live-rotate
        aria-label={t('liveAudience.rotate', 'Rotate screen')}
        onClick={(e) => { e.stopPropagation(); onRotate(); }}
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-md"
      >
        <RotateCw className="h-[18px] w-[18px]" />
      </button>
    </>
  );
}
