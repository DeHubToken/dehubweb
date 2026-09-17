/**
 * The chrome the live post page wears on a phone.
 *
 * Opening a stream on a phone used to give the desktop card shrunk down: a
 * 16:9 letterbox in a bento, a creator row above it, an action bar and a title
 * below, and the chat behind a button. The stream itself got about a third of
 * the screen. The app has drawn this surface full-bleed for a while — picture
 * edge to edge, everything else floating on it — and this is that layout on
 * the web, component for component:
 *
 *   header      creator capsule · follow · audience · collapse · close
 *   pills       state · elapsed · title, on one scrolling line
 *   (chat and the action bar are the caller's — they sit under this)
 *   scrub line  the foot of the screen
 *
 * It is chrome only. Playback, gifts, the chat and the action bar all stay
 * where they were in LiveStreamCard; this draws over them.
 *
 * Styling comes from the shorts viewer's kit — `w-10 h-10 rounded-full
 * bg-zinc-900/60 backdrop-blur-sm`, white icons, no hue — so a phone viewer
 * opening a short and a phone viewer opening a stream see one app. The mobile
 * app's ViewerChrome was derived from those same numbers, which is why the two
 * platforms land in the same place.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Clock, Eye, Heart, Plus, Volume2, VolumeX, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { useAuth } from '@/contexts/AuthContext';

const compact = (n: number) => {
  try {
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
};

const two = (n: number) => (n < 10 ? `0${n}` : String(n));

const elapsedLabel = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
};

/** One circle of chrome. Same size and fill as the shorts viewer's buttons. */
const CIRCLE =
  'w-10 h-10 rounded-full bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center text-white shrink-0';

const PILL =
  'h-[26px] shrink-0 rounded-full bg-zinc-900/60 backdrop-blur-sm px-2.5 flex items-center gap-1.5 text-white';

export interface ImmersiveLiveChromeProps {
  streamerName: string;
  creatorUsername?: string;
  creatorId?: string;
  avatar?: string;
  title?: string;
  isLive: boolean;
  isEnded: boolean;
  viewers: string | number;
  /** When the broadcast started, for the running clock on the pills. */
  startedAt?: string | number | Date | null;
  isMuted: boolean;
  onToggleMute: () => void;
  /** The three-dot menu, handed in so it stays the post's real options menu. */
  optionsSlot?: React.ReactNode;
  /** 0..1 of the replay. Undefined for a stream that is genuinely on air. */
  progress?: number;
  onSeek?: (ratio: number) => void;
  /** Chrome hidden by the chevron; the caller dims its own overlays to match. */
  hidden: boolean;
  onToggleHidden: () => void;
}

export function ImmersiveLiveChrome({
  streamerName,
  creatorUsername,
  creatorId,
  avatar,
  title,
  isLive,
  isEnded,
  viewers,
  startedAt,
  isMuted,
  onToggleMute,
  optionsSlot,
  progress,
  onSeek,
  hidden,
  onToggleHidden,
}: ImmersiveLiveChromeProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, openLoginModal } = useAuth();

  // The creator's real follow state. The stream row carries a name and an
  // avatar and nothing about the viewer's relationship to them, so a Follow
  // button drawn from it alone would offer to follow someone already followed.
  const { data: profile } = useDeHubProfile({
    userId: creatorId || undefined,
    address: walletAddress || undefined,
    enabled: !!creatorId,
  });
  const overrides = useFollowOverrides();
  const isFollowing = creatorId
    ? (overrides.get(creatorId.toLowerCase()) ?? profile?.isFollowing === true)
    : false;
  const isSelf = !!(
    walletAddress &&
    creatorId &&
    walletAddress.toLowerCase() === creatorId.toLowerCase()
  );

  const handleFollow = useCallback(() => {
    if (!creatorId) return;
    if (!walletAddress) {
      openLoginModal();
      return;
    }
    void toggleFollowFor(queryClient, creatorId, false, { name: streamerName });
  }, [creatorId, walletAddress, openLoginModal, queryClient, streamerName]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/app');
  }, [navigate]);

  // One interval, and only while the stream is actually running — an ended
  // stream's clock would otherwise keep counting past the end of it.
  const startedMs = useMemo(() => {
    if (!startedAt) return null;
    const ms = new Date(startedAt).getTime();
    return Number.isFinite(ms) ? ms : null;
  }, [startedAt]);
  const running = isLive && !isEnded && startedMs != null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const statusLabel = isLive
    ? t('stages.live', 'LIVE')
    : isEnded
      ? t('stages.ended', 'ENDED')
      : t('postInfo.streamOffline', 'Stream Offline').toUpperCase();

  const followerCount = profile?.followers ?? 0;

  /* ── the scrub line ───────────────────────────────────────────────────
     Same bar the shorts viewer draws: 1px at rest, 2px under a finger, a
     white/20 track and a white/80 fill. Live has nothing to scrub — the
     caller passes no progress and the bar is not rendered at all. */
  const trackRef = useRef<HTMLDivElement>(null);
  const [seeking, setSeeking] = useState(false);
  const seekable = progress !== undefined && !!onSeek;

  const ratioFromEvent = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const box = el.getBoundingClientRect();
    if (box.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  }, []);

  useEffect(() => {
    if (!seeking) return;
    const move = (e: PointerEvent) => onSeek?.(ratioFromEvent(e.clientX));
    const up = (e: PointerEvent) => {
      onSeek?.(ratioFromEvent(e.clientX));
      setSeeking(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [seeking, onSeek, ratioFromEvent]);

  return (
    <>
      {/* Readability, top and bottom. Pointer-transparent — the picture under
          them still takes a tap. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300',
          hidden && 'opacity-0'
        )}
      />

      {/* Header */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 flex items-center gap-2 p-4 transition-opacity duration-300',
          hidden && 'pointer-events-none opacity-0'
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => creatorUsername && navigate(`/app/profile/${creatorUsername}`)}
            className="flex h-10 min-w-0 items-center gap-2 rounded-full bg-zinc-900/60 pl-[5px] pr-3 backdrop-blur-sm"
          >
            <Avatar className="h-[30px] w-[30px] rounded-full">
              <AvatarImage src={avatar} alt={streamerName} className="rounded-full" />
              <AvatarFallback className="rounded-full bg-zinc-700 text-[11px] font-medium text-white">
                {streamerName?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 text-left">
              <span className="block truncate text-[13px] font-bold leading-tight text-white">
                {streamerName}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-semibold leading-tight text-white/70">
                <Heart className="h-[9px] w-[9px] fill-current" />
                {compact(followerCount)}
              </span>
            </span>
          </button>

          {/* The one filled control on the frame, and it leaves once it has
              been used — an already-followed creator does not need a button
              parked on their own stream. */}
          {!isSelf && !isFollowing && creatorId ? (
            <button
              type="button"
              onClick={handleFollow}
              className="flex h-[34px] shrink-0 items-center gap-0.5 rounded-full bg-white px-3 text-[13px] font-bold text-zinc-950"
            >
              <Plus className="h-[13px] w-[13px]" strokeWidth={2.5} />
              {t('follow.follow', 'Follow')}
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Audience. A count, not an avatar stack: the presence socket
              carries a number and inventing faces for it would be a lie at a
              glance. */}
          <span className={cn(PILL, 'h-10 px-3 text-xs font-bold')}>
            <Eye className="h-[13px] w-[13px]" />
            {typeof viewers === 'number' ? compact(viewers) : viewers}
          </span>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? t('stages.unmute', 'Unmute') : t('stages.mute', 'Mute')}
            className={CIRCLE}
          >
            {isMuted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
          </button>

          {optionsSlot}

          <button
            type="button"
            onClick={onToggleHidden}
            aria-label={t('stages.fullscreen', 'Fullscreen')}
            className={CIRCLE}
          >
            <ChevronDown className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={goBack}
            aria-label={t('common.close', 'Close')}
            className={CIRCLE}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Pills: state, elapsed, title — one scrolling line that can overflow
          off the right edge without pushing anything around. */}
      <div
        className={cn(
          'absolute inset-x-0 top-[72px] z-20 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-opacity duration-300',
          hidden && 'pointer-events-none opacity-0'
        )}
      >
        <span className={PILL}>
          <span
            className={cn('h-1.5 w-1.5 rounded-full bg-white', !isLive && 'bg-white/40')}
          />
          <span className="text-[10px] font-extrabold tracking-wider">{statusLabel}</span>
        </span>
        {running && startedMs != null ? (
          <span className={PILL}>
            <Clock className="h-[11px] w-[11px] text-white/75" />
            <span className="text-[11px] font-semibold text-white/85">
              {elapsedLabel(now - startedMs)}
            </span>
          </span>
        ) : null}
        {title ? (
          <span className={cn(PILL, 'max-w-[220px]')}>
            <span className="truncate text-[11px] font-semibold text-white/85">{title}</span>
          </span>
        ) : null}
      </div>

      {/* The way back when the chrome is down. Nothing else is on screen, so
          it cannot be the chevron in a header that is no longer drawn. */}
      {hidden ? (
        <button
          type="button"
          onClick={onToggleHidden}
          aria-label={t('stages.exitFullscreen', 'Exit fullscreen')}
          className={cn(CIRCLE, 'absolute right-4 top-4 z-20')}
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      ) : null}

      {/* The timeline. Only a replay has one — a broadcast on air has nothing
          behind the live edge to move to. */}
      {seekable ? (
        <div
          ref={trackRef}
          onPointerDown={(e) => {
            e.preventDefault();
            setSeeking(true);
            onSeek?.(ratioFromEvent(e.clientX));
          }}
          className="absolute inset-x-0 bottom-0 z-30 flex h-6 cursor-pointer touch-none select-none items-end"
        >
          <div
            className={cn(
              'relative w-full transition-[height] duration-150',
              seeking ? 'h-0.5' : 'h-px'
            )}
          >
            <div className="absolute inset-0 bg-white/20" />
            <div
              className="absolute bottom-0 left-0 top-0 bg-white/80"
              style={{ width: `${Math.min(1, Math.max(0, progress ?? 0)) * 100}%` }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

export default ImmersiveLiveChrome;
