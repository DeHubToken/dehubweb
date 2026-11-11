import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import CastIcon from '@/components/ui/cut-icons/cast';
import { castToTv, prepareCastToTv, type CastSource } from '@/lib/castToTv';

interface CastMenuItemProps {
  /** Built at tap time, so the TV starts from where the page player is now. */
  getSource: () => CastSource | null;
  onBeforeCast?: () => void;
  /** A Chromecast took the video; the page's player should stay paused. */
  onCasting?: () => void;
  className?: string;
}

/**
 * "Cast to TV" row for a video's three-dot menu. Safari opens its AirPlay
 * picker, Chrome its Chromecast picker. Browsers that cannot cast keep the row
 * and get a line saying where it works.
 */
export function CastMenuItem({ getSource, onBeforeCast, onCasting, className }: CastMenuItemProps) {
  const { t } = useTranslation();
  useEffect(() => { prepareCastToTv(); }, []);
  return (
    <button
      type="button"
      data-cast-to-tv
      onClick={async () => {
        const source = getSource();
        onBeforeCast?.();
        if (!source) return;
        const result = await castToTv(source);
        if (result === 'unsupported') {
          toast(t('postOptions.castUnsupported', "This browser can't cast. Open Riftn in Chrome or Safari to play it on your TV."));
        } else if (result === 'failed') {
          toast.error(t('postOptions.castFailed', "Couldn't reach the TV. Check it's on the same Wi-Fi and try again."));
        } else if (result === 'casting') {
          onCasting?.();
          toast.success(t('postOptions.castStarted', 'Playing on your TV'));
        }
      }}
      className={className ?? 'flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left'}
    >
      <CastIcon className="w-5 h-5" /> {t('postOptions.castToTv', 'Cast to TV')}
    </button>
  );
}
