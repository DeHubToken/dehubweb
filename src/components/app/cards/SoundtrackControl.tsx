import { Loader2, Music, Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  title?: string;
  creator?: string;
  playing: boolean;
  loading: boolean;
  error: boolean;
  toggle: () => void;
}

export function SoundtrackControl({ title, creator, playing, loading, error, toggle }: Props) {
  const { t } = useTranslation();
  const action = error ? t('explorePage.retry') : loading ? t('common.cancel') : playing ? t('audioPost.pause') : t('audioPost.play');
  const name = title || t('feed.music');
  return (
    <button
      type="button"
      data-no-navigate
      data-keep-dark
      aria-label={`${action}: ${name}${creator ? ` — ${creator}` : ''}`}
      aria-pressed={playing}
      onClick={(event) => { event.stopPropagation(); toggle(); }}
      className="flex min-h-11 max-w-full items-center gap-2.5 rounded-xl border border-white/15 bg-black/75 px-3 py-2 text-white shadow-sm backdrop-blur-xl transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <Music className="h-4 w-4 shrink-0 text-white/70" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-medium">{name}</span>
        {creator && <span className="block truncate text-[11px] text-white/75">{creator}</span>}
      </span>
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        : error ? <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
        : playing ? <Pause className="h-4 w-4 shrink-0" aria-hidden="true" />
        : <Play className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="text-[11px] font-medium" aria-live="polite">{loading ? t('common.loading') : action}</span>
    </button>
  );
}
