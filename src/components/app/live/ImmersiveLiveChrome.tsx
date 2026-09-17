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
 * Styling comes from the shorts viewer's kit — rounded squares, white icons,
 * no hue — so a phone viewer opening a short and a phone viewer opening a
 * stream see one app. The mobile app's ViewerChrome was derived from the same
 * numbers, which is why the two platforms land in the same place. The fill is
 * lighter here and every control on the header row is one height; see CIRCLE.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Clock, Eye, Heart, Plus, Volume2, VolumeX, X } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import { BadgeIcon } from '@/components/app/BadgeIcon';
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
/**
 * The same shape and size it always was, with most of the fill taken out.
 *
 * At zinc-900/60 every icon sat on its own little slab and the head of the
 * frame read as a row of cards laid on the broadcast. At black/20 the shape
 * is still there — it still groups the icon and still says 'control' — but
 * the picture reads straight through it. The scrim at the top and a drop
 * shadow carry the contrast the fill used to, which is what the mobile
 * viewer does with TEXT_SHADOW.
 */
const CIRCLE =
  'w-12 h-12 rounded-xl bg-black/20 backdrop-blur-sm flex items-center justify-center text-white shrink-0 drop-shadow-[0_1px_4px_rgba(0,0,0,0.65)]';

const PILL =
  'h-[26px] shrink-0 rounded-lg bg-black/20 backdrop-blur-sm px-2.5 flex items-center gap-1.5 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.65)]';

export interface ImmersiveLiveChromeProps {
  streamerName: string;
  creatorUsername?: string;
  creatorId?: string;
  /** The creator's badge, as every other surface draws it beside a name. */
  badgeBalance?: number;
  avatar?: string;
  title?: string;
  isLive: boolean;
  isEnded: boolean;
  viewers: string | number;
  /** DHB tipped to this stream, all told. Always drawn, zero included. */
  giftTotal?: number;
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
  badgeBalance,
  avatar,
  title,
  isLive,
  isEnded,
  viewers,
  giftTotal,
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

  /* A handle is a route of its own — /:username — and an address is a query
     on the profile page. There is no /app/profile/:handle, so pushing one
     landed the viewer on the 404 page instead of the creator whose stream
     they were watching. Same order as CardHeader so both ways into a profile
     end up at the same URL. */
  const openCreatorProfile = useCallback(() => {
    const handle = creatorUsername?.replace('@', '');
    if (handle) navigate(`/${handle}`);
    else if (creatorId) navigate(`/app/profile?id=${creatorId}`);
  }, [creatorUsername, creatorId, navigate]);

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
          // pt clears the notch. On a phone browser the page starts under the
          // status bar, so a flat 16px put the top of the creator capsule
          // behind it and the row read as cut off — which is exactly what it
          // was, just not by anything in the page.
          'absolute inset-x-0 top-0 z-20 flex items-center gap-1.5 px-3 pb-4 pt-[max(1rem,env(safe-area-inset-top))] transition-opacity duration-300',
          hidden && 'pointer-events-none opacity-0'
        )}
      >
        {/* Takes the row's spare width and gives it up before the controls
            do. Without `flex-1` this shrank to min-content and the name,
            which truncates, rendered at zero width — a capsule with an
            avatar and nothing beside it. */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            onClick={openCreatorProfile}
            /* `flex-1` plus a text box that can take the slack: without both,
               the capsule sized to its content and the name — which truncates,
               so it will happily be zero wide — rendered as an avatar with a
               blank space beside it. And min-h rather than a fixed h-10,
               because two lines of type plus the padding came to more than
               40px, and the follower line was cut in half by the bottom edge.
               48 now, so the numbers are not pressed against the rounded
               corner they sit in. */
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl bg-black/20 py-1 pl-1 pr-2.5 backdrop-blur-sm drop-shadow-[0_1px_4px_rgba(0,0,0,0.65)]"
          >
            <Avatar className="h-[34px] w-[34px] rounded-lg">
              <AvatarImage src={avatar} alt={streamerName} className="rounded-lg" />
              <AvatarFallback className="rounded-lg bg-zinc-700 text-[11px] font-medium text-white">
                {streamerName?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 text-left">
              {/* The badge rides the name, as it does on the feed card, in the
                  chat and on the profile. The one surface in the app showing a
                  creator without it was this one. */}
              {/* `items-baseline` and a 1em badge — the arrangement CardHeader
                  uses, and the reason the badge sits where the eye expects it.
                  Centred against a 13px line it hung low enough to read as a
                  different element. */}
              <span className="flex min-w-0 items-baseline gap-1 text-[13px] font-bold leading-tight text-white">
                <span className="truncate">{streamerName}</span>
                <BadgeIcon
                  badgeBalance={badgeBalance}
                  username={creatorUsername}
                  /* 11px, with the heart and the eye under it. At 1em it was
                     the tallest thing on the line and read as a sticker. */
                  className="h-[11px] w-[11px] shrink-0"
                />
              </span>
              {/* Followers, watching, gifts — the three numbers that say
                  what this stream is, on one line under the name where a
                  glance already is. They were a heart in the capsule and a
                  chip out on the pill row, which read as two unrelated
                  facts about two different things. */}
              <span className="flex items-center gap-2 text-[11px] font-semibold leading-tight text-white/70">
                <span className="flex items-center gap-1">
                  <Heart className="h-[9px] w-[9px] fill-current" />
                  {compact(followerCount)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-[10px] w-[10px]" />
                  {typeof viewers === 'number' ? compact(viewers) : viewers}
                </span>
                {/* Always drawn, zero included: a stream with no gifts yet is
                    a fact about it, and a counter that appears only once it
                    is non-zero reads as one that is broken. */}
                <span className="flex items-center gap-1">
                  <img src={dehubCoin} alt="" className="h-[11px] w-[11px]" />
                  {compact(giftTotal ?? 0)}
                </span>
              </span>

            </span>
          </button>

          {/* The one filled control on the frame, and it leaves once it has
              been used — an already-followed creator does not need a button
              parked on their own stream. */}
          {!isSelf && !isFollowing && creatorId ? (
            /* A square, like the rest of the row. The word cost ~60px on a
               375px line and the creator capsule paid it — the name came out
               as "ni…" with the numbers squeezed under it. A filled plus on
               a creator's own stream is not ambiguous, and the label stays
               for the screen reader. */
            <button
              type="button"
              onClick={handleFollow}
              aria-label={t('follow.follow', 'Follow')}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-950"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
          'absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+78px)] z-20 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-opacity duration-300',
          hidden && 'pointer-events-none opacity-0'
        )}
      >
        {/* No state pill. Whether a stream is live or over is on the card
            you pressed to get here, and on the profile before that; saying
            it a third time over the picture tells nobody anything. */}

        {running && startedMs != null ? (
          <span className={PILL}>
            <Clock className="h-[11px] w-[11px] text-white/75" />
            <span className="text-[11px] font-semibold text-white/90">
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
