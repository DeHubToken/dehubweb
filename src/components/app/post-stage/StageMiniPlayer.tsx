import { useTranslation as _useCopy } from 'react-i18next';
/**
 * The pinned strip of the phone post page. Once the media has scrolled out of
 * view it appears at the top: back, a small thumbnail with a progress line,
 * the title over "creator · time", play/pause for anything that plays, and a
 * like button. Tapping the strip brings the media back into view.
 *
 * It does not own playback or the vote. Play/pause drives the post's own
 * <video>/<audio> element, and like presses the action bar's like tile, so
 * the optimistic count, the vote cache and the reaction rules stay in one
 * place (ActionBar) and the two controls can never disagree.
 */
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { ArrowLeft, Pause, Play, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export type StageMediaKind = 'video' | 'audio' | 'image' | 'text';

interface StageMiniPlayerProps {
  rootRef: RefObject<HTMLElement>;
  kind: StageMediaKind;
  title: string;
  subtitle: string;
  thumbnail?: string;
  onBack: () => void;
}

/** What the strip watches: the media, or the creator row on a text post. */
function findAnchor(root: HTMLElement | null, kind: StageMediaKind): HTMLElement | null {
  if (!root) return null;
  const post = root.querySelector('[data-stage-post]');
  const sel = kind === 'text' ? '[data-stage-creator]' : '[data-image-media], [data-media-full]';
  return post?.querySelector<HTMLElement>(sel) ?? null;
}

function findPlayer(root: HTMLElement | null): HTMLMediaElement | null {
  return root?.querySelector('[data-stage-post]')?.querySelector<HTMLMediaElement>('[data-media-full] video, [data-video-card] audio, [data-video-card] video') ?? null;
}

function findLikeTile(root: HTMLElement | null): HTMLButtonElement | null {
  return root?.querySelector<HTMLButtonElement>('[data-stage-post] [data-stage-bar] [data-stage-action="like"]') ?? null;
}

export function StageMiniPlayer({ rootRef, kind, title, subtitle, thumbnail, onBack }: StageMiniPlayerProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const plays = kind === 'video' || kind === 'audio';

  // Shown once the anchor has gone off the top of the screen, not merely out
  // of view (a short page can have it below the fold on first paint).
  useEffect(() => {
    let io: IntersectionObserver | null = null;
    let raf = 0;
    const attach = () => {
      const anchor = findAnchor(rootRef.current, kind);
      if (!anchor) {
        raf = requestAnimationFrame(attach);
        return;
      }
      io = new IntersectionObserver(([entry]) => {
        // Above the screen, not below it. Checked on the top edge: the callback
        // fires when the bottom edge crosses the margin, mid-scroll.
        setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      }, { threshold: 0, rootMargin: '-56px 0px 0px 0px' });
      io.observe(anchor);
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [rootRef, kind]);

  // Mirror the player while the strip is up.
  useEffect(() => {
    if (!visible || !plays) return;
    const el = findPlayer(rootRef.current);
    if (!el) return;
    const sync = () => {
      setPlaying(!el.paused && !el.ended);
      setProgress(el.duration > 0 ? Math.min(1, el.currentTime / el.duration) : 0);
    };
    sync();
    const events = ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata'] as const;
    events.forEach((e) => el.addEventListener(e, sync));
    return () => events.forEach((e) => el.removeEventListener(e, sync));
  }, [visible, plays, rootRef]);

  // Mirror the like tile's engaged state.
  useEffect(() => {
    if (!visible) return;
    const tile = findLikeTile(rootRef.current);
    if (!tile) return;
    const sync = () => setLiked(tile.hasAttribute('data-engaged') && tile.getAttribute('data-engaged') !== 'dislike');
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(tile, { attributes: true, attributeFilter: ['data-engaged'] });
    return () => mo.disconnect();
  }, [visible, rootRef]);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const el = findPlayer(rootRef.current);
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, [rootRef]);

  const like = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    findLikeTile(rootRef.current)?.click();
  }, [rootRef]);

  const backToMedia = useCallback(() => {
    findAnchor(rootRef.current, kind)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [rootRef, kind]);

  const showThumb = !!thumbnail && !thumbFailed;

  // Portalled: canvas themes put filters on the page frame, which would make
  // `position: fixed` relative to that frame instead of the screen.
  return createPortal(
    <div
      data-stage-mini
      data-visible={visible || undefined}
      aria-hidden={!visible}
      className={cn(
        'fixed inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] z-[46] transition-all duration-200',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-3 opacity-0',
      )}
    >
      <div
        role="button"
        tabIndex={visible ? 0 : -1}
        onClick={backToMedia}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); backToMedia(); } }}
        aria-label={t('postStage.backToMedia', 'Back to the post')}
        data-stage-mini-strip
        className="flex h-[60px] items-center gap-2.5 rounded-xl pl-1.5 pr-2"
      >
        <button
          type="button"
          tabIndex={visible ? 0 : -1}
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          aria-label={t('postStage.back', 'Go back')}
          data-stage-mini-btn
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span data-stage-mini-thumb className="relative h-11 w-[72px] shrink-0 overflow-hidden rounded-lg">
          {showThumb ? (
            <img src={thumbnail} alt="" className="h-full w-full object-cover" onError={() => setThumbFailed(true)} />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm font-bold">{(subtitle || title || '?').charAt(0).toUpperCase()}</span>
          )}
          {plays && (
            <span className="absolute inset-x-0 bottom-0 h-[3px]" data-stage-mini-track>
              <span className="block h-full" data-stage-mini-progress style={{ width: `${progress * 100}%` }} />
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span data-stage-ink className="truncate text-sm font-bold leading-tight">{title}</span>
          <span data-stage-muted className="truncate text-xs leading-tight">{subtitle}</span>
        </span>
        {plays && (
          <button
            type="button"
            tabIndex={visible ? 0 : -1}
            onClick={togglePlay}
            aria-label={playing ? _copy("copy.858e4ba7a29f", { defaultValue: "Pause" }) : _copy("copy.436e61016e26", { defaultValue: "Play" })}
            data-stage-mini-btn
            data-stage-mini-play
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          >
            {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
          </button>
        )}
        <button
          type="button"
          tabIndex={visible ? 0 : -1}
          onClick={like}
          aria-label={liked ? t('postStage.unlike', 'Remove like') : t('postStage.like', 'Like')}
          aria-pressed={liked}
          data-stage-mini-btn
          data-engaged={liked ? 'like' : undefined}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
        >
          <ThumbsUp className={cn('h-5 w-5', liked && 'fill-current')} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
