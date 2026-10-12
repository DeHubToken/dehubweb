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
import { Users, Volume2, VolumeX } from "lucide-react";
import { ChevronRight, X } from "@/components/ui/cut-icons";

import { formatDistanceToNow } from 'date-fns';
import dehubCoin from '@/assets/dehub-coin.png';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveAudience } from '@/hooks/use-live-audience';
import { LiveAudienceSheet, audienceAvatar, audienceName } from './LiveAudienceSheet';

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
  'w-10 h-10 rounded-xl bg-black/30 border border-white/15 backdrop-blur-md flex items-center justify-center text-white shrink-0';

const PILL =
  'h-7 shrink-0 rounded-[10px] bg-black/30 border border-white/15 backdrop-blur-md px-2.5 flex items-center gap-1.5 text-white';

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
  likeCount?: number;
  /** When the broadcast started, for the running clock on the pills. */
  startedAt?: string | number | Date | null;
  isMuted: boolean;
  onToggleMute: () => void;
  /** The three-dot menu, handed in so it stays the post's real options menu. */
  optionsSlot?: React.ReactNode;
  /** 0..1 of the replay. Undefined for a stream that is genuinely on air. */
  progress?: number;
  onSeek?: (ratio: number) => void;
  /** Chrome cleared by a swipe down; the caller dims its own overlays to match. */
  hidden: boolean;
  /** For the Who's here sheet and the faces on its pill. */
  streamId?: string;
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
  streamId,
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


  const [audienceOpen, setAudienceOpen] = useState(false);
  const { data: audience, isLoading: audienceLoading } = useLiveAudience(streamId, {
    open: audienceOpen,
    enabled: !hidden || audienceOpen,
  });
  const watching = Math.max(typeof viewers === 'number' ? viewers : Number(viewers) || 0, audience?.watching ?? 0);
  const faces = (audience?.here ?? []).slice(0, 3);
  // Re-read every minute so "Started 3 minutes ago" moves on.
  const [, setMinute] = useState(0);
  useEffect(() => {
    if (startedMs == null) return;
    const id = window.setInterval(() => setMinute((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [startedMs]);
  const startedLabel = startedMs != null
    ? t('liveAudience.startedAgo', { time: formatDistanceToNow(startedMs, { addSuffix: true }), defaultValue: 'Started {{time}}' })
    : null;

  /* ── the scrub line ───────────────────────────────────────────────────
     Same bar the shorts viewer draws: 1px at rest, 2px under a finger, a
     white/20 track and a white/80 fill. Live has nothing to scrub — the
     caller passes no progress and the bar is not rendered at all. */
  const trackRef = useRef<HTMLDivElement>(null);
  const [seeking, setSeeking] = useState(false);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
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
    const move = (e: PointerEvent) => setSeekPreview(ratioFromEvent(e.clientX));
    const up = (e: PointerEvent) => {
      onSeek?.(ratioFromEvent(e.clientX));
      setSeeking(false);
      setSeekPreview(null);
    };
    const cancel = () => { setSeeking(false); setSeekPreview(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
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
          'absolute inset-x-0 top-0 z-20 flex items-center gap-1 px-2 pb-4 pt-[max(1rem,env(safe-area-inset-top))] transition-opacity duration-300',
          hidden && 'invisible pointer-events-none opacity-0'
        )}
      >
        {/* Takes the row's spare width and gives it up before the controls
            do. Without `flex-1` this shrank to min-content and the name,
            which truncates, rendered at zero width — a capsule with an
            avatar and nothing beside it. */}
        {/* One capsule for who started this: face with a live ring, name
            and badge, when they went live, and Follow inside it. */}
        <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-white/15 bg-black/30 py-1 pl-1 pr-1.5 backdrop-blur-md">
          <button type="button" onClick={openCreatorProfile} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className={cn('rounded-full p-[1px] ring-2', isLive && !isEnded ? 'ring-red-500' : 'ring-transparent')}>
              <Avatar className="h-8 w-8">
                <AvatarImage src={avatar} alt={streamerName} />
                <AvatarFallback className="bg-zinc-700 text-[11px] font-medium text-white">
                  {streamerName?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-baseline gap-1 text-[14px] font-extrabold leading-tight text-white">
                <span className="truncate">{streamerName}</span>
                <BadgeIcon badgeBalance={badgeBalance} username={creatorUsername} className="h-[11px] w-[11px] shrink-0" />
              </span>
              {startedLabel ? (
                <span className="block truncate text-[11px] font-semibold leading-tight text-white/75">{startedLabel}</span>
              ) : null}
            </span>
          </button>
          {/* Gone once following: an already-followed creator does not need a
              button parked on their own stream. */}
          {!isSelf && !isFollowing && creatorId ? (
            <button
              type="button"
              onClick={handleFollow}
              data-live-follow
              className="h-[30px] shrink-0 rounded-[9px] px-3 text-[12.5px] font-extrabold"
            >
              {t('follow.follow', 'Follow')}
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
            onClick={goBack}
            data-swipe-back
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
          'absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+68px)] z-20 flex gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-opacity duration-300',
          hidden && 'invisible pointer-events-none opacity-0'
        )}
      >
        {/* Live and how long, in one tag: red is the only hue on the frame. */}
        {isLive && !isEnded ? (
          <span className={PILL}>
            <span className="rounded-[5px] bg-red-500 px-1.5 py-px text-[9.5px] font-black tracking-wider text-white">
              {t('stages.live', 'LIVE')}
            </span>
            {running && startedMs != null ? (
              <span className="text-[11px] font-semibold text-white/90">{elapsedLabel(now - startedMs)}</span>
            ) : null}
          </span>
        ) : null}

        {/* Who's here: newest faces and the head count. Tap for the sheet. */}
        {streamId ? (
          <button
            type="button"
            onClick={() => setAudienceOpen(true)}
            aria-label={t('liveAudience.whosHere', "Who's here")}
            className={PILL}
          >
            {faces.length ? (
              <span className="-ml-1 flex">
                {faces.map((f, i) => (
                  <Avatar key={f.address} className={cn('h-[18px] w-[18px] border-[1.5px] border-black/55', i > 0 && '-ml-1.5')}>
                    <AvatarImage src={audienceAvatar(f)} alt="" />
                    <AvatarFallback className="bg-zinc-700 text-[8px] text-white">{audienceName(f)[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                ))}
              </span>
            ) : (
              <Users className="h-3 w-3 text-white/85" />
            )}
            <span className="text-[11px] font-semibold text-white/90">
              {t('liveAudience.hereCount', { formatted: compact(watching), defaultValue: '{{formatted}} here' })}
            </span>
            <ChevronRight className="h-3 w-3 text-white/60" />
          </button>
        ) : null}

        <span className={PILL}>
          <img src={dehubCoin} alt="" className="h-[11px] w-[11px]" />
          <span className="text-[11px] font-semibold text-white/90">{compact(giftTotal ?? 0)}</span>
        </span>

        {title ? (
          <span className={cn(PILL, 'max-w-[220px]')}>
            <span className="truncate text-[11px] font-semibold text-white/85">{title}</span>
          </span>
        ) : null}
      </div>

      {/* The timeline. Only a replay has one — a broadcast on air has nothing
          behind the live edge to move to. */}
      {seekable ? (
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={title || t('feed.videos')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((seekPreview ?? progress ?? 0) * 100)}
          onKeyDown={(e) => {
            const current = progress ?? 0;
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1
              : ['ArrowRight', 'ArrowUp'].includes(e.key) ? Math.min(1, current + 0.05)
              : ['ArrowLeft', 'ArrowDown'].includes(e.key) ? Math.max(0, current - 0.05)
              : null;
            if (next === null) return;
            e.preventDefault();
            onSeek?.(next);
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.focus();
            setSeeking(true);
            setSeekPreview(ratioFromEvent(e.clientX));
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
              style={{ width: `${Math.min(1, Math.max(0, seekPreview ?? progress ?? 0)) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      <LiveAudienceSheet open={audienceOpen} onOpenChange={setAudienceOpen} audience={audience} loading={audienceLoading} />
    </>
  );
}

export default ImmersiveLiveChrome;
