/**
 * A stream that is live right now, as a full-screen slide in the Shorts swipe
 * viewer (dual-format live).
 *
 * Swiping onto it puts the viewer in the room: the slide on screen is the live
 * page itself (the same LiveStreamCard and chat the post page draws), with the
 * picture cropped to the creator's Vertical view box. Swiping on leaves.
 *
 * The slides either side only show the cover, cropped the same way, so a live
 * stream next door costs a picture, not a player and a chat socket.
 */
import { lazy, memo, Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Eye from '@/components/ui/cut-icons/visibility';
import { LiveStreamCard } from './LiveStreamCard';
import { useStreamOverlay } from '@/hooks/use-stream-overlay';
import { verticalCropStyle } from '@/lib/live-overlay/vertical-crop';
import type { LiveStream } from '@/types/feed.types';

const LivePostChat = lazy(() => import('./LivePostChat').then((m) => ({ default: m.LivePostChat })));

interface Props {
  stream: LiveStream;
  /** On screen: the viewer is in the room. */
  isActive: boolean;
  /** Close the Shorts viewer (the room's close button). */
  onClose: () => void;
}

/**
 * The viewer's swipe is a native pointer-down listener on the pager around
 * the slides. Scrolling the chat or typing in it must not start one, so the
 * slide stops those pointer-downs on their way up, natively: a React handler
 * runs at the root, after the pager has already seen the event.
 */
function useKeepChatGestures(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const keep = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-shorts-scrollable], textarea, input')) e.stopPropagation();
    };
    el.addEventListener('pointerdown', keep);
    return () => el.removeEventListener('pointerdown', keep);
  }, [active]);
  return ref;
}

export const LiveSwipeSlide = memo(function LiveSwipeSlide({ stream, isActive, onClose }: Props) {
  const { t } = useTranslation();
  const { data: overlay } = useStreamOverlay(stream.streamId, true);
  const crop = overlay?.verticalCrop?.enabled ? overlay.verticalCrop : null;
  const roomRef = useKeepChatGestures(isActive);

  if (isActive) {
    return (
      <div ref={roomRef} data-live-slide className="absolute inset-0 overflow-hidden bg-black">
        <LiveStreamCard
          stream={stream}
          immersive
          swipeFeed={{ onClose, verticalCrop: crop }}
          chatSlot={
            <Suspense fallback={null}>
              <LivePostChat tokenId={String(stream.tokenId ?? stream.id)} streamId={stream.streamId} overlay />
            </Suspense>
          }
        />
      </div>
    );
  }

  return (
    <div data-live-slide-preview className="absolute inset-0 overflow-hidden bg-black">
      {stream.thumbnail && (
        <div className="absolute inset-0" style={crop ? verticalCropStyle(crop) : undefined}>
          <img src={stream.thumbnail} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex items-center gap-2">
        <span className="rounded-md bg-red-600 px-1.5 py-1 text-xs font-extrabold leading-none tracking-wide text-white">
          {t('liveStudio.vertical.live')}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/45 px-2 py-1 text-xs text-white backdrop-blur">
          <Eye className="h-3 w-3" aria-hidden="true" />
          {stream.viewers}
        </span>
      </div>
      <p className="absolute bottom-8 left-4 right-4 truncate text-[15px] font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.8)]">
        @{stream.creatorUsername || stream.streamer}
      </p>
    </div>
  );
});
