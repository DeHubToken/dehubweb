/**
 * SpotifyCard
 * ===========
 * What a pasted Spotify link becomes in a post, comment or chat: the cover,
 * the name, who made it, and a Play button. Play hands the link to the corner
 * player (`SpotifyMiniPlayer`), so the song keeps going while you browse.
 *
 * Colours are inline on purpose: the light and System themes remap the
 * black/white utility classes, which would turn the green Play button's black
 * icon white.
 *
 * @module components/app/cards/SpotifyCard
 */

import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import ExternalLink from '@/components/ui/cut-icons/open-externally';
import { outsideImage } from '@/lib/outside-image';
import type { LinkPreviewData } from '@/lib/api/link-preview';
import { cleanSpotifyTitle, type SpotifyKind, type SpotifyLink } from '@/lib/spotify';
import { playSpotify, toggleSpotify, useSpotifyPlayer } from '@/lib/spotify-player';

export const SPOTIFY_GREEN = '#1ED760';

export function SpotifyLogo({ className, color = SPOTIFY_GREEN }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" style={{ fill: color }}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14C9.6 9.9 15 10.56 18.72 12.84c.36.18.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true" style={{ fill: '#000', marginLeft: 2 }}>
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true" style={{ fill: '#000' }}>
      <rect x="6" y="4" width="4.2" height="16" rx="1.2" />
      <rect x="13.8" y="4" width="4.2" height="16" rx="1.2" />
    </svg>
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

interface SpotifyCardProps { preview: LinkPreviewData; link: SpotifyLink; compact?: boolean }

/** forwardRef: AnimatePresence (popLayout) hands its children a ref. */
export const SpotifyCard = forwardRef<HTMLDivElement, SpotifyCardProps>(function SpotifyCard({ preview, link, compact = false }, ref) {
  const { t } = useTranslation();
  const { current, isPaused } = useSpotifyPlayer();
  const kindLabel = t(`spotify.kind.${link.kind}`, { defaultValue: KIND_LABEL[link.kind] });
  const cleaned = cleanSpotifyTitle(preview.title || '');
  const title = cleaned && cleaned !== 'open.spotify.com' ? cleaned : kindLabel;
  const subtitle = subtitleFor(preview, kindLabel);
  const isCurrent = current?.link.uri === link.uri;
  const showPause = isCurrent && isPaused === false;

  const play = (e: { stopPropagation: () => void; preventDefault?: () => void }) => {
    e.stopPropagation();
    e.preventDefault?.();
    if (showPause) {
      toggleSpotify();
      return;
    }
    playSpotify({ link, title, subtitle, image: preview.image });
  };

  const art = compact ? 'h-14 w-14' : 'h-[72px] w-[72px]';

  return (
    <motion.div
      ref={ref}
      data-glass-embed
      data-spotify-card={link.kind}
      role="button"
      tabIndex={0}
      onClick={play}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') play(e); }}
      onPointerDown={(e) => e.stopPropagation()}
      initial={false}
      className={`flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-colors hover:bg-white/[0.08] ${compact ? 'max-w-sm p-2' : 'p-2.5'}`}
    >
      <div className={`relative ${art} shrink-0 overflow-hidden rounded-lg bg-white/10`}>
        {preview.image ? (
          <img src={outsideImage(preview.image)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <SpotifyLogo className="h-7 w-7" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-5 text-white">{title}</p>
        <p className="truncate text-xs leading-5 text-white/55">{subtitle}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <SpotifyLogo className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium text-white/60">
            {isCurrent
              ? (showPause ? t('spotify.playingNow', { defaultValue: 'Playing now' }) : t('spotify.inPlayer', { defaultValue: 'In your player' }))
              : 'Spotify'}
          </span>
        </div>
      </div>

      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label={t('spotify.openInSpotify', { defaultValue: 'Open in Spotify' })}
        title={t('spotify.openInSpotify', { defaultValue: 'Open in Spotify' })}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ExternalLink className="h-4 w-4" />
      </a>

      <button
        type="button"
        onClick={play}
        aria-label={showPause ? t('spotify.pause', { defaultValue: 'Pause' }) : t('spotify.play', { defaultValue: 'Play' })}
        title={showPause ? t('spotify.pause', { defaultValue: 'Pause' }) : t('spotify.play', { defaultValue: 'Play' })}
        className="mr-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
        style={{ background: SPOTIFY_GREEN, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}
      >
        {showPause ? <PauseGlyph /> : <PlayGlyph />}
      </button>
    </motion.div>
  );
});
