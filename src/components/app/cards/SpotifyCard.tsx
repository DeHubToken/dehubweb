/**
 * SpotifyCard
 * ===========
 * What a pasted Spotify link becomes in a post, comment or chat: the cover
 * over a soft wash of its own colours, the name, who made it, a Play button,
 * a progress bar and a pill with Pop out and Open in Spotify.
 *
 * Play starts the song right here, in the card: Spotify's player runs out of
 * sight (`SpotifyMiniPlayer`) and this card is its face. Pop out moves it to
 * the corner player so it follows you while you browse; pressing it again
 * brings it back. If the card scrolls away while playing, the corner player
 * steps in by itself so the music is never left with no way to stop it.
 *
 * Also exports the pieces the corner player and the profile grid tile use:
 * the progress bar, the equaliser and the now-playing bar.
 *
 * The Play button's colours are inline on purpose: the light and System
 * themes remap the black/white utility classes, which would turn the green
 * button's black icon white.
 *
 * @module components/app/cards/SpotifyCard
 */

import { forwardRef, useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import ExternalLink from '@/components/ui/cut-icons/open-externally';
import PictureInPicture from '@/components/ui/cut-icons/picture-in-picture';
import X from '@/components/ui/cut-icons/close';
import { cn } from '@/lib/utils';
import { outsideImage } from '@/lib/outside-image';
import type { LinkPreviewData } from '@/lib/api/link-preview';
import { cleanSpotifyTitle, type SpotifyKind, type SpotifyLink } from '@/lib/spotify';
import {
  closeSpotify,
  playSpotify,
  seekSpotify,
  setSpotifyPopout,
  spotifyPositionNow,
  toggleSpotify,
  useSpotifyOnScreen,
  useSpotifyPlayer,
  useSpotifyProgress,
  type SpotifyNowPlaying,
} from '@/lib/spotify-player';
import './spotify-card.css';

export const SPOTIFY_GREEN = '#1ED760';

export function SpotifyLogo({ className, color = SPOTIFY_GREEN }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" style={{ fill: color }}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14C9.6 9.9 15 10.56 18.72 12.84c.36.18.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3z" />
    </svg>
  );
}

export function PlayGlyph({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" style={{ fill: '#000', marginLeft: '8%' }}>
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}

export function PauseGlyph({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" style={{ fill: '#000' }}>
      <rect x="6" y="4" width="4.2" height="16" rx="1.2" />
      <rect x="13.8" y="4" width="4.2" height="16" rx="1.2" />
    </svg>
  );
}

export function SpotifySpinner({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(className, 'animate-spin')} aria-hidden="true" style={{ fill: 'none', stroke: '#000', strokeWidth: 3, strokeLinecap: 'round' }}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

/** Three bars that dance while the song plays and rest when it stops. */
export function SpotifyEq({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span className={cn('spotify-eq', playing && 'spotify-eq--on', className)} aria-hidden>
      <i /><i /><i />
    </span>
  );
}

const KIND_LABEL: Record<SpotifyKind, string> = {
  track: 'Song',
  album: 'Album',
  playlist: 'Playlist',
  episode: 'Podcast episode',
  show: 'Podcast',
  artist: 'Artist',
};

/** Spotify's own share text, "Artist · Song · 1987", minus the noise around it. */
function subtitleFor(preview: LinkPreviewData, fallback: string): string {
  const description = (preview.description || '').trim();
  if (description && description.length <= 160 && !/^listen to /i.test(description)) return description;
  return fallback;
}

/** Name, line under it and kind for a Spotify link preview. */
export function useSpotifyItem(preview: LinkPreviewData, link: SpotifyLink): SpotifyNowPlaying & { kindLabel: string } {
  const { t } = useTranslation();
  const kindLabel = t(`spotify.kind.${link.kind}`, { defaultValue: KIND_LABEL[link.kind] });
  const cleaned = cleanSpotifyTitle(preview.title || '');
  const title = cleaned && cleaned !== 'open.spotify.com' ? cleaned : kindLabel;
  return { link, title, subtitle: subtitleFor(preview, kindLabel), image: preview.image, kindLabel };
}

/** Everything a card needs to know about whether it is the one playing, and its buttons. */
export function useSpotifyControls(item: SpotifyNowPlaying) {
  const player = useSpotifyPlayer();
  const isCurrent = player.current?.link.uri === item.link.uri;
  const isPlaying = isCurrent && player.isPaused === false;
  const isLoading = isCurrent && !isPlaying && player.isPaused === null;
  const poppedOut = isCurrent && player.popout;

  const play = useCallback((e?: { stopPropagation: () => void; preventDefault?: () => void }) => {
    e?.stopPropagation();
    e?.preventDefault?.();
    if (isPlaying) {
      toggleSpotify();
      return;
    }
    playSpotify(item);
  }, [isPlaying, item]);

  const popOut = useCallback((e?: { stopPropagation: () => void; preventDefault?: () => void }) => {
    e?.stopPropagation();
    e?.preventDefault?.();
    if (isCurrent) setSpotifyPopout(!player.popout);
    else playSpotify(item, { popout: true });
  }, [isCurrent, item, player.popout]);

  return { isCurrent, isPlaying, isLoading, poppedOut, needsTap: isCurrent && player.needsTap, play, popOut };
}

const formatTime = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** A 30 second clip: Spotify plays previews to listeners not signed in to it. */
export function useIsSpotifyPreview(kind: SpotifyKind, active: boolean): boolean {
  const { duration } = useSpotifyProgress();
  return active && kind !== 'episode' && kind !== 'show' && duration > 28_500 && duration < 31_500;
}

/**
 * The progress bar of what is playing, with times either side. Tap or drag
 * to jump. Runs smoothly between the embed's reports; only the playing card
 * has one that moves.
 */
export function SpotifyProgress({ active, compact = false, times = true, className }: { active: boolean; compact?: boolean; times?: boolean; className?: string }) {
  const { t } = useTranslation();
  const progress = useSpotifyProgress();
  const fillRef = useRef<HTMLSpanElement>(null);
  const nowRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const duration = active ? progress.duration : 0;

  // Between reports, walk the bar on with the clock.
  useEffect(() => {
    const paint = () => {
      if (dragging.current) return;
      const at = active ? spotifyPositionNow(progress) : 0;
      const ratio = duration ? Math.min(1, at / duration) : 0;
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${ratio})`;
      if (nowRef.current) nowRef.current.textContent = formatTime(at);
    };
    paint();
    if (!active || !progress.playing) return;
    let frame = 0;
    let last = 0;
    const loop = (time: number) => {
      // ~15 fps is plenty for a thin bar and keeps long feeds cheap.
      if (time - last > 66) { last = time; paint(); }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active, progress, duration]);

  const ratioAt = (e: ReactPointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return rect.width ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
  };
  const showAt = (ratio: number) => {
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${ratio})`;
    if (nowRef.current) nowRef.current.textContent = formatTime(ratio * duration);
  };

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)} data-spotify-progress>
      {times && <span ref={nowRef} className={cn('w-8 shrink-0 tabular-nums text-white/60', compact ? 'text-[10px]' : 'text-[11px]')}>0:00</span>}
      <span
        role="slider"
        tabIndex={active && duration ? 0 : -1}
        aria-label={t('spotify.seek', { defaultValue: 'Seek' })}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration / 1000)}
        aria-valuenow={Math.round((active ? progress.position : 0) / 1000)}
        aria-disabled={!active || !duration}
        className={cn('spotify-track group relative flex h-5 min-w-0 flex-1 items-center', active && duration ? 'cursor-pointer' : 'pointer-events-none')}
        style={{ touchAction: 'none' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!active || !duration) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          showAt(ratioAt(e));
        }}
        onPointerMove={(e) => { if (dragging.current) showAt(ratioAt(e)); }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          seekSpotify(ratioAt(e));
        }}
        onPointerCancel={() => { dragging.current = false; }}
        onKeyDown={(e) => {
          if (!duration || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
          e.preventDefault();
          e.stopPropagation();
          const step = (e.key === 'ArrowRight' ? 5000 : -5000) / duration;
          seekSpotify(spotifyPositionNow() / duration + step);
        }}
      >
        <span className="spotify-track-rail" />
        <span ref={fillRef} className="spotify-track-fill" style={{ transform: 'scaleX(0)' }} />
      </span>
      {times && <span className={cn('w-8 shrink-0 text-right tabular-nums text-white/60', compact ? 'text-[10px]' : 'text-[11px]')}>{duration ? formatTime(duration) : '–:––'}</span>}
    </div>
  );
}

/** The round green Play / Pause. */
export function SpotifyPlayButton({ playing, loading, onPress, size = 44, label }: { playing: boolean; loading?: boolean; onPress: (e: { stopPropagation: () => void; preventDefault?: () => void }) => void; size?: number; label?: string }) {
  const { t } = useTranslation();
  const name = label ?? (playing ? t('spotify.pause', { defaultValue: 'Pause' }) : t('spotify.play', { defaultValue: 'Play' }));
  const glyph = size >= 40 ? 'h-[18px] w-[18px]' : 'h-[15px] w-[15px]';
  return (
    <button
      type="button"
      data-spotify-play
      data-keep-round
      onClick={onPress}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={name}
      title={name}
      className="spotify-play flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
      style={{ width: size, height: size, background: SPOTIFY_GREEN }}
    >
      {loading ? <SpotifySpinner className={glyph} /> : playing ? <PauseGlyph className={glyph} /> : <PlayGlyph className={glyph} />}
    </button>
  );
}

/** Pop out and Open in Spotify, side by side in one pill. */
function SpotifyPillActions({ link, poppedOut, onPopOut, compact }: { link: SpotifyLink; poppedOut: boolean; onPopOut: (e: { stopPropagation: () => void }) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const popLabel = poppedOut
    ? t('spotify.backInPost', { defaultValue: 'Play here instead' })
    : t('spotify.popOut', { defaultValue: 'Pop out' });
  const btn = cn('flex items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white', compact ? 'h-7 w-7' : 'h-8 w-8');
  return (
    <div data-spotify-pill className="flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.07] p-0.5">
      <button
        type="button"
        data-spotify-popout
        aria-pressed={poppedOut}
        onClick={onPopOut}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={popLabel}
        title={popLabel}
        className={cn(btn, poppedOut && 'bg-white/15 text-white')}
      >
        <PictureInPicture className="h-4 w-4" />
      </button>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={t('spotify.openInSpotify', { defaultValue: 'Open in Spotify' })}
        title={t('spotify.openInSpotify', { defaultValue: 'Open in Spotify' })}
        className={btn}
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}

interface SpotifyCardProps { preview: LinkPreviewData; link: SpotifyLink; compact?: boolean }

/** forwardRef: AnimatePresence (popLayout) hands its children a ref. */
export const SpotifyCard = forwardRef<HTMLDivElement, SpotifyCardProps>(function SpotifyCard({ preview, link, compact = false }, ref) {
  const { t } = useTranslation();
  const item = useSpotifyItem(preview, link);
  const { isCurrent, isPlaying, isLoading, poppedOut, needsTap, play, popOut } = useSpotifyControls(item);
  const isPreview = useIsSpotifyPreview(link.kind, isCurrent);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useSpotifyOnScreen(rootRef, link.uri);
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
  }, [ref]);

  const status = !isCurrent
    ? item.kindLabel
    : needsTap
      ? t('spotify.tapToStart', { defaultValue: 'Tap play in the Spotify player' })
      : poppedOut
        ? t('spotify.inCorner', { defaultValue: 'Playing in the corner' })
        : isPlaying
          ? t('spotify.playingNow', { defaultValue: 'Playing now' })
          : isLoading
            ? t('spotify.loading', { defaultValue: 'Loading…' })
            : t('spotify.paused', { defaultValue: 'Paused' });

  const art = compact ? 'h-14 w-14' : 'h-[72px] w-[72px]';
  const image = preview.image ? outsideImage(preview.image) : null;

  return (
    <motion.div
      ref={setRefs as Ref<HTMLDivElement>}
      data-glass-embed
      data-spotify-card={link.kind}
      data-playing={isPlaying || undefined}
      role="button"
      tabIndex={0}
      aria-label={`${item.title}, ${item.subtitle}`}
      onClick={play}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) play(e); }}
      onPointerDown={(e) => e.stopPropagation()}
      initial={false}
      className={cn(
        'spotify-card relative w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-colors hover:bg-white/[0.08]',
        compact ? 'max-w-sm' : '',
      )}
    >
      {image && <img src={image} alt="" aria-hidden className="spotify-card-wash" loading="lazy" decoding="async" />}

      <div className={cn('relative flex items-center gap-3', compact ? 'p-2' : 'p-2.5 pb-1.5')}>
        <div className={cn('spotify-card-art relative shrink-0 overflow-hidden rounded-xl bg-white/10', art)}>
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <SpotifyLogo className="h-7 w-7" />
            </div>
          )}
          {isCurrent && (
            <span data-on-media className="absolute bottom-1 left-1 flex h-5 items-center rounded-full bg-black/55 px-1.5 backdrop-blur-sm">
              <SpotifyEq playing={isPlaying} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-5 text-white">{item.title}</p>
          <p className="truncate text-xs leading-5 text-white/55">{item.subtitle}</p>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <SpotifyLogo className="h-3.5 w-3.5 shrink-0" />
            <span className={cn('min-w-0 truncate text-[11px] font-medium', isPlaying ? 'text-white/80' : 'text-white/55')}>{status}</span>
            {isPreview && (
              <span
                className="shrink-0 rounded-full border border-white/15 px-1.5 text-[10px] font-semibold leading-4 text-white/70"
                title={t('spotify.previewHint', { defaultValue: 'Sign in to Spotify in this browser for full songs' })}
              >
                {t('spotify.preview', { defaultValue: 'Preview' })}
              </span>
            )}
          </div>
        </div>

        <SpotifyPlayButton playing={isPlaying} loading={isLoading} onPress={play} size={compact ? 40 : 44} />
      </div>

      <div className={cn('relative flex items-center gap-2', compact ? 'px-2 pb-2' : 'px-3 pb-2.5')}>
        <SpotifyProgress active={isCurrent} compact={compact} className="flex-1" />
        <SpotifyPillActions link={link} poppedOut={poppedOut} onPopOut={popOut} compact={compact} />
      </div>
    </motion.div>
  );
});

/**
 * The corner player's face: what is playing, Play / Pause, progress, and
 * close. Shown when popped out, or when the card it plays from is off screen.
 */
export function SpotifyNowPlayingBar() {
  const { t } = useTranslation();
  const { current, isPaused, popout } = useSpotifyPlayer();
  const isPreview = useIsSpotifyPreview(current?.link.kind ?? 'track', !!current);
  if (!current) return null;
  const playing = isPaused === false;
  const image = current.image ? outsideImage(current.image) : null;

  return (
    <div data-glass-mini-audio data-spotify-bar className="spotify-bar relative overflow-hidden rounded-2xl border border-white/10 bg-black/60 p-2.5 shadow-2xl backdrop-blur-[24px]">
      {image && <img src={image} alt="" aria-hidden className="spotify-card-wash" />}
      <div className="relative flex items-center gap-3">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/10">
          {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><SpotifyLogo className="h-5 w-5" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-5 text-white">{current.title}</p>
          <div className="flex min-w-0 items-center gap-1.5">
            <SpotifyLogo className="h-3 w-3 shrink-0" />
            <p className="min-w-0 truncate text-[11px] leading-4 text-white/55">{current.subtitle}</p>
            {isPreview && <span className="shrink-0 rounded-full border border-white/15 px-1.5 text-[9px] font-semibold leading-[14px] text-white/70">{t('spotify.preview', { defaultValue: 'Preview' })}</span>}
          </div>
        </div>
        {popout && (
          <button
            type="button"
            onClick={() => setSpotifyPopout(false)}
            aria-label={t('spotify.backInPost', { defaultValue: 'Play here instead' })}
            title={t('spotify.backInPost', { defaultValue: 'Play here instead' })}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PictureInPicture className="h-4 w-4" />
          </button>
        )}
        <SpotifyPlayButton playing={playing} loading={isPaused === null} onPress={(e) => { e.stopPropagation(); toggleSpotify(); }} size={38} />
        <button
          type="button"
          onClick={closeSpotify}
          aria-label={t('spotify.stopAndClose', { defaultValue: 'Stop and close' })}
          title={t('spotify.stopAndClose', { defaultValue: 'Stop and close' })}
          className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <SpotifyProgress active compact className="relative mt-1.5" />
    </div>
  );
}
