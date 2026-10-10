import { useTranslation as _useCopy } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Loader2, Music, Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  title?: string;
  creator?: string;
  playing: boolean;
  loading: boolean;
  error: boolean;
  toggle: () => void;
  audioRef?: RefObject<HTMLAudioElement | null>;
  /** overlay: idle capsule that opens into a wave along the photo's bottom edge.
   *  inline: the capsule alone, for places with no photo edge to run along. */
  layout?: 'overlay' | 'inline';
}

const BAR_COUNT = 40;

/** Stable bar heights per song, so the same song always draws the same wave. */
function waveFor(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) + i;
    const noise = ((h >>> 0) % 1000) / 1000;
    const shape = Math.abs(Math.sin(i * 0.55)) * 0.5 + 0.5;
    return 0.3 + 0.7 * noise * shape;
  });
}

function useProgress(audioRef: RefObject<HTMLAudioElement | null> | undefined, active: boolean) {
  const [state, setState] = useState({ current: 0, duration: 0 });
  const read = useCallback(() => {
    const a = audioRef?.current;
    const duration = a && a.duration > 0 && Number.isFinite(a.duration) ? a.duration : 0;
    const current = duration ? a!.currentTime : 0;
    setState(prev => prev.current === current && prev.duration === duration ? prev : { current, duration });
  }, [audioRef]);
  useEffect(() => {
    if (!active) return;
    read();
    const id = window.setInterval(read, 250);
    return () => window.clearInterval(id);
  }, [read, active]);
  return { ...state, read };
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function SoundtrackControl({ title, creator, playing, loading, error, toggle, audioRef, layout = 'overlay' }: Props) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const action = error ? t('explorePage.retry') : loading ? t('common.cancel') : playing ? t('audioPost.pause') : t('audioPost.play');
  const name = title || t('feed.music');
  const label = `${action}: ${name}${creator ? ` — ${creator}` : ''}`;
  const open = playing || loading;
  const bars = useMemo(() => waveFor(`${name}|${creator ?? ''}`), [name, creator]);
  const { current, duration, read } = useProgress(audioRef, open && layout === 'overlay');
  const onClick = (event: React.MouseEvent) => { event.stopPropagation(); toggle(); };

  // The wave is the song's seek bar. It has to catch its own pointer: left
  // click-through, a drag along it landed on the photo underneath and opened
  // the post (feed) or the fullscreen viewer (post page).
  const [scrub, setScrub] = useState<number | null>(null);
  const dragging = useRef(false);
  const fractionAt = (el: HTMLElement, clientX: number) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 ? Math.min(1, Math.max(0, (clientX - box.left) / box.width)) : 0;
  };
  const seek = (seconds: number) => {
    const a = audioRef?.current;
    if (!a || !duration) return;
    a.currentTime = Math.min(duration, Math.max(0, seconds));
    read();
  };
  const onScrubDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!duration) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setScrub(fractionAt(event.currentTarget, event.clientX));
  };
  const onScrubMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setScrub(fractionAt(event.currentTarget, event.clientX));
  };
  const onScrubUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!dragging.current) return;
    dragging.current = false;
    seek(fractionAt(event.currentTarget, event.clientX) * duration);
    setScrub(null);
  };
  const onScrubCancel = () => { dragging.current = false; setScrub(null); };
  const onScrubKey = (event: React.KeyboardEvent) => {
    const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[event.key];
    const to = step !== undefined ? current + step : event.key === 'Home' ? 0 : event.key === 'End' ? duration : null;
    if (to === null || !duration) return;
    event.preventDefault();
    event.stopPropagation();
    seek(to);
  };
  const progress = scrub ?? (duration ? current / duration : 0);

  const icon = loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    : error ? <RotateCcw className="h-4 w-4" aria-hidden="true" />
    : playing ? <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
    : <Play className="h-4 w-4 translate-x-px fill-current" aria-hidden="true" />;

  if (layout === 'overlay' && open) {
    return (
      <div data-keep-dark className="dh-soundwave relative w-full pt-10 text-white">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/15 to-black/65" aria-hidden="true" />
        <div className="relative flex items-end gap-3 px-3">
          <div data-keep-dark className="min-w-0 flex-1 [text-shadow:0_1px_8px_rgba(0,0,0,.6)]">
            <span className="flex items-center gap-1.5 truncate text-sm font-semibold"><Music className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{name}</span>
            {creator && <span className="block truncate text-xs text-white/80">{creator}</span>}
          </div>
          <button
            type="button"
            data-no-navigate
            aria-label={label}
            aria-pressed={playing}
            onClick={onClick}
            className="dh-sound-glass pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {icon}
          </button>
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label={_copy("copy.67ae3405bcd4", { defaultValue: "Seek" })}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(scrub === null ? current : scrub * duration)}
          aria-valuetext={`${clock(scrub === null ? current : scrub * duration)} of ${clock(duration)}`}
          data-no-navigate
          data-no-swipe
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerCancel={onScrubCancel}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={onScrubKey}
          className="pointer-events-auto relative mx-3 cursor-pointer touch-none py-2 outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <div className={cn('flex h-3.5 items-center gap-[2px]', playing && 'is-playing')} aria-hidden="true">
            {bars.map((h, i) => (
              <i
                key={i}
                className={cn('dh-soundwave-bar', i / BAR_COUNT < progress && 'is-played')}
                style={{ '--h': h.toFixed(2), animationDelay: `-${((i * 0.137) % 0.5).toFixed(2)}s` } as React.CSSProperties}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-no-navigate
      data-keep-dark
      aria-label={label}
      aria-pressed={playing}
      onClick={onClick}
      className={cn(
        'dh-sound-glass pointer-events-auto flex h-9 max-w-full items-center gap-2 rounded-full px-3 text-white transition-[width,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
        layout === 'overlay' && 'mb-2 ml-2',
      )}
    >
      {playing ? (
        <span className="dh-sound-eq is-playing" aria-hidden="true"><i /><i /><i /><i /></span>
      ) : error ? <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        : loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        : <Music className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 max-w-[10rem] truncate text-xs font-semibold">{name}</span>
      {playing ? <Pause className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden="true" /> : !error && !loading && <Play className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden="true" />}
    </button>
  );
}
