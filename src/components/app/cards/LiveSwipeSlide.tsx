/**
 * A stream that is live right now, as a full-screen slide in the Shorts swipe
 * viewer (dual-format live).
 *
 * The landscape picture is cropped on this device to the creator's Vertical
 * view box. Over it: the last few chat lines, read-only, and the buttons a
 * passer-by needs — react, gift, chat, share, and Join live. Anything more
 * (typing in chat, the gift sheet, polls) is the full stream page, one tap away.
 *
 * Only the slide on screen joins the chat room, and only it and the next slide
 * load the stream, so swiping past a live slide costs nothing.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Gem, MessageCircle, Share2, ThumbsUp } from 'lucide-react';
import Eye from '@/components/ui/cut-icons/visibility';
import { useStreamOverlay } from '@/hooks/use-stream-overlay';
import { useLiveChatMessages } from '@/hooks/use-livechat';
import { useLiveReaction } from '@/hooks/use-live-reaction';
import { streamChatRoomId } from '@/lib/api/dehub/livechat';
import { verticalCropStyle } from '@/lib/live-overlay/vertical-crop';
import { viewerShareUrl } from '@/lib/share-url';
import { cn } from '@/lib/utils';
import type { LiveStream } from '@/types/feed.types';

interface Props {
  stream: LiveStream;
  /** On screen: plays, joins the chat room. */
  isActive: boolean;
  /** Next up: loads the stream so the swipe lands on a picture. */
  preload: boolean;
  isMuted: boolean;
  /** Called before leaving for the stream page, so the viewer can close itself. */
  onLeave: () => void;
}

const CHAT_LINES = 4;
const RAIL_BUTTON =
  'flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white backdrop-blur-md active:scale-95';

/** Plays a live HLS stream: Safari natively, everything else through hls.js. */
function useLivePlayback(video: HTMLVideoElement | null, url: string, load: boolean, play: boolean) {
  useEffect(() => {
    if (!video || !load || !url) return;
    let disposed = false;
    let hls: { destroy: () => void } | null = null;
    const native = video.canPlayType('application/vnd.apple.mpegurl') && /apple/i.test(navigator.vendor || '');
    if (native) {
      video.src = url;
    } else {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (disposed) return;
          if (!Hls.isSupported()) {
            video.src = url;
            return;
          }
          const instance = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
          instance.loadSource(url);
          instance.attachMedia(video);
          hls = instance;
        })
        .catch(() => undefined);
    }
    return () => {
      disposed = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [video, url, load]);

  useEffect(() => {
    if (!video) return;
    if (play) void video.play().catch(() => undefined);
    else video.pause();
  }, [video, play, load]);
}

export const LiveSwipeSlide = memo(function LiveSwipeSlide({ stream, isActive, preload, isMuted, onLeave }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const url = stream.playbackUrl || stream.playbackUrls?.[0] || '';
  const { data: overlay } = useStreamOverlay(stream.streamId, isActive || preload);
  const crop = overlay?.verticalCrop?.enabled ? overlay.verticalCrop : null;

  useLivePlayback(video, url, isActive || preload, isActive);

  const roomId = isActive && stream.tokenId ? streamChatRoomId(stream.tokenId) : null;
  const { messages } = useLiveChatMessages(roomId);
  const recent = (messages || []).filter((m) => m.content?.trim()).slice(-CHAT_LINES);

  const { sendLiveReaction } = useLiveReaction(stream.streamId, isActive);
  const [likes, setLikes] = useState(0);
  const likeBurst = useRef(0);

  const open = (state: Record<string, unknown> = {}) => {
    onLeave();
    navigate(`/app/post/${stream.id}`, { state: { fromFeed: true, ...state } });
  };

  const share = async () => {
    const link = viewerShareUrl(`${window.location.origin}/app/post/${stream.id}`);
    try {
      if (navigator.share) await navigator.share({ title: stream.title, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast.success(t('liveStudio.vertical.linkCopied'));
      }
    } catch {
      /* The share sheet was closed. */
    }
  };

  return (
    <div data-live-slide className="absolute inset-0 overflow-hidden bg-black">
      <div className="absolute inset-0" style={crop ? verticalCropStyle(crop) : undefined}>
        {stream.thumbnail && !playing && (
          <img src={stream.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <video
          ref={setVideo}
          muted={isMuted}
          playsInline
          autoPlay={isActive}
          onPlaying={() => setPlaying(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.45)_0%,transparent_18%,transparent_50%,rgba(0,0,0,.85)_100%)]" />

      <div className="absolute left-4 top-[max(4.75rem,env(safe-area-inset-top))] flex items-center gap-2">
        <span className="rounded-md bg-red-600 px-1.5 py-1 text-xs font-extrabold leading-none tracking-wide text-white">
          {t('liveStudio.vertical.live')}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/45 px-2 py-1 text-xs text-white backdrop-blur">
          <Eye className="h-3 w-3" aria-hidden="true" />
          {stream.viewers}
        </span>
      </div>

      {isActive && recent.length > 0 && (
        <ul aria-live="polite" className="absolute bottom-[12.5rem] left-4 right-20 flex flex-col items-start gap-1.5">
          {recent.map((m, i) => (
            <li
              key={m.id}
              className={cn(
                'max-w-full truncate rounded-lg bg-black/45 px-2.5 py-1 text-[13px] text-white backdrop-blur',
                i === 0 && recent.length === CHAT_LINES && 'opacity-50',
              )}
            >
              <b className="mr-1 font-semibold text-red-300">{m.sender_display_name || m.sender_username || '—'}</b>
              {m.content}
            </li>
          ))}
        </ul>
      )}

      <div className="absolute bottom-40 right-3 flex flex-col items-center gap-3 text-[11px] text-white/90">
        <button
          type="button"
          aria-label={t('liveStudio.vertical.react')}
          className={RAIL_BUTTON}
          onClick={() => {
            sendLiveReaction('like');
            likeBurst.current += 1;
            setLikes(likeBurst.current);
          }}
        >
          <ThumbsUp className="h-5 w-5" />
        </button>
        <span className="-mt-2">{(stream.likeCount ?? 0) + likes}</span>
        <button type="button" aria-label={t('liveStudio.vertical.gift')} className={RAIL_BUTTON} onClick={() => open({ openGift: true })}>
          <Gem className="h-5 w-5" />
        </button>
        <span className="-mt-2">{t('liveStudio.vertical.gift')}</span>
        <button type="button" aria-label={t('liveStudio.vertical.chat')} className={RAIL_BUTTON} onClick={() => open()}>
          <MessageCircle className="h-5 w-5" />
        </button>
        <span className="-mt-2">{t('liveStudio.vertical.chat')}</span>
        <button type="button" aria-label={t('liveStudio.vertical.share')} className={RAIL_BUTTON} onClick={share}>
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute bottom-24 left-4 right-20">
        <div className="flex items-center gap-2 text-[15px] font-bold text-white">
          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border-2 border-red-600 bg-zinc-700">
            {stream.avatar && <img src={stream.avatar} alt="" className="h-full w-full object-cover" />}
          </span>
          <span className="truncate">@{stream.creatorUsername || stream.streamer}</span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[13.5px] text-white/85">{stream.title}</p>
      </div>

      <button
        type="button"
        onClick={() => open()}
        className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] left-4 right-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-base font-extrabold text-zinc-950 active:scale-[0.99]"
      >
        <span className="h-2 w-2 rounded-full bg-red-600 shadow-[0_0_0_4px_rgba(220,38,38,.25)]" />
        {t('liveStudio.vertical.join')}
      </button>
    </div>
  );
});
