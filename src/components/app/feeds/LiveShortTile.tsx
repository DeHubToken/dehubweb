/**
 * A live stream as a tile in the Shorts grid: the creator's 9:16 window of their
 * landscape picture, cropped on this device (dual-format live). Tapping opens
 * it in the swipe viewer, or the full stream where there is no viewer.
 *
 * No crop set means the middle of the picture, which is exactly what a 9:16
 * tile with object-cover already shows, and is also right for a stream that is
 * portrait to begin with. A creator who switched vertical view off is left out
 * of the grid.
 */
import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Eye from '@/components/ui/cut-icons/visibility';
import { AutoplayVideo } from '@/components/app/AutoplayVideo';
import { useStreamOverlay } from '@/hooks/use-stream-overlay';
import { verticalCropStyle } from '@/lib/live-overlay/vertical-crop';
import type { LiveStream } from '@/types/feed.types';

interface Props {
  stream: LiveStream;
  disabled?: boolean;
  /** Open the stream in the swipe viewer. Without it a tap goes to the stream page. */
  onOpen?: () => void;
}

export const LiveShortTile = memo(function LiveShortTile({ stream, disabled, onOpen }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: overlay, isLoading } = useStreamOverlay(stream.streamId, true);
  const crop = overlay?.verticalCrop ?? null;
  const src = stream.playbackUrl || stream.playbackUrls?.[0];

  if (crop && !crop.enabled) return null;
  // Hold the tile until the crop is known, so the picture does not jump.
  const ready = !isLoading;

  return (
    <button
      type="button"
      data-media-tile
      data-media-scrim
      data-live-short
      onClick={() => (onOpen ? onOpen() : navigate(`/app/post/${stream.id}`, { state: { fromFeed: true } }))}
      aria-label={t('liveStudio.vertical.watch', { name: stream.streamer })}
      className="relative aspect-[9/16] overflow-hidden rounded-xl bg-zinc-900 text-left"
    >
      {ready && src ? (
        <div className="absolute inset-0" style={crop ? verticalCropStyle(crop) : undefined}>
          <AutoplayVideo
            src={src}
            hlsSrc={src.includes('.m3u8') ? src : undefined}
            poster={stream.thumbnail || undefined}
            className="h-full w-full object-cover"
            disabled={disabled}
            playbackGroup="shorts-grid"
            threshold={0.7}
            rootMargin="200px"
          />
        </div>
      ) : stream.thumbnail ? (
        <img src={stream.thumbnail} alt="" className="h-full w-full object-cover" />
      ) : null}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <span className="absolute left-2 top-2 rounded-[5px] bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide text-white">
        {t('liveStudio.vertical.live')}
      </span>
      <div className="absolute bottom-[6px] left-2 right-2 flex min-w-0 items-end gap-1">
        <div className="h-6 w-6 flex-shrink-0 overflow-hidden rounded-[5px] bg-zinc-700">
          {stream.avatar && <img src={stream.avatar} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[10px] font-medium leading-[11px] text-white">
            @{stream.creatorUsername || stream.streamer}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] leading-[10px] text-white/90">
            <Eye className="h-[9px] w-[9px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
            {stream.viewers}
          </span>
        </div>
      </div>
    </button>
  );
});
