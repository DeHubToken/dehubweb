import { useTranslation as _useCopy } from 'react-i18next';
/**
 * The three controls that float on the media of the phone post page: back on
 * the left, the options menu on the right (AI overview lives inside it). Glass squares with
 * rounded corners (never circles), the same treatment the feed's media
 * buttons use. Post info lives in the options menu now.
 *
 * `data-on-media` keeps the baseline themes' control finish off them (see
 * theme-controls.css): that finish turns a dark square into a pale chip that
 * disappears over a bright frame.
 */
import { ArrowLeft, MoreHorizontal, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

interface StageMediaChromeProps {
  onBack: () => void;
  onMenu: () => void;
  /** Own posts only: the boost shortcut the creator row used to carry. */
  onBoost?: () => void;
  /** Extra squares (PPV / bounty / gate badges) placed before the menu. */
  children?: ReactNode;
  /**
   * `media` floats the row over the top of a photo or video. `inline` is for
   * a post with no media (text, article): the same row in the page flow.
   */
  placement?: 'media' | 'inline';
}

export function StageMediaChrome({ onBack, onMenu, onBoost, children, placement = 'media' }: StageMediaChromeProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      data-stage-media-chrome={placement}
      data-no-navigate
      className={
        placement === 'media'
          ? 'pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-2.5'
          : 'pointer-events-none relative flex items-start justify-between pb-3 pt-2.5'
      }
    >
      <button
        type="button"
        data-on-media
        data-stage-glass-square
        onClick={stop(onBack)}
        aria-label={t('postStage.back', 'Go back')}
        className="pointer-events-auto"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="pointer-events-auto flex items-center gap-2">
        {children}
        {onBoost && (
          <button
            type="button"
            data-on-media
            data-stage-glass-square
            onClick={stop(onBoost)}
            aria-label={t('postOptions.boostPost')}
          >
            <Zap className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          data-on-media
          data-stage-glass-square
          onClick={stop(onMenu)}
          aria-label={_copy("copy.2545613b2ba8", { defaultValue: "Post options" })}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
