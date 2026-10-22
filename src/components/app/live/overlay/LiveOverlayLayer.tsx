/**
 * A creator's overlay, drawn over their stream in the viewer's own player.
 *
 * This is the in-app half of stream overlays: every DeHub viewer draws the
 * creator's widgets locally from the stream's room events, whatever the stream
 * is coming from — a phone, a browser, a capture card or OBS. The other half is
 * the OBS browser source, which burns the same widgets into the video; when the
 * creator has switched to that (`renderIn: 'video'`), this layer draws nothing,
 * or every alert would land twice.
 *
 * Loaded on demand by the live card, which is on the boot path.
 */
import { useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import '@/styles/live-overlay.css';
import { useLiveRoomEvents } from '@/hooks/use-live-room-events';
import { streamOverlayKey } from '@/hooks/use-stream-overlay';
import { useVideoPictureRect } from '@/hooks/use-video-picture-rect';
import { drawOrder, placeWidget, rectFor } from '@/lib/live-overlay/layout';
import { isKnownKind, type OverlayKind } from '@/lib/live-overlay/registry';
import type { PublicOverlay } from '@/lib/live-overlay/types';
import { createOverlayEventBus, OverlayEventContext } from './overlay-events';
import { OverlayWidgetView } from './overlay-widgets';

interface Props {
  streamId: string;
  overlay: PublicOverlay;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The audience figure the card already shows, until the room sends one. */
  initialViewers: number;
}

export default function LiveOverlayLayer({ streamId, overlay, videoRef, initialViewers }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const picture = useVideoPictureRect(layerRef, videoRef);
  const queryClient = useQueryClient();
  const bus = useMemo(() => createOverlayEventBus(), []);

  const visible = useMemo(
    () => (overlay.renderIn === 'app' ? drawOrder(overlay.widgets.filter((w) => w.enabled && isKnownKind(w.kind))) : []),
    [overlay],
  );

  // Joined even while there is nothing to draw: a creator who adds their first
  // widget mid-stream, or switches back from OBS, is heard through this.
  useLiveRoomEvents(streamId, true, (event) => {
    if (event.type === 'overlayUpdated') {
      void queryClient.invalidateQueries({ queryKey: streamOverlayKey(streamId) });
      return;
    }
    bus.publish(event);
  });

  return (
    <OverlayEventContext.Provider value={bus}>
      <div ref={layerRef} data-live-overlay aria-hidden>
        {picture.width > 0 &&
          visible.map((widget) => {
            const box = placeWidget(rectFor(widget, picture.portrait), picture);
            const style = {
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              '--ow-h': `${box.height}px`,
              '--ow-w': `${box.width}px`,
            } as CSSProperties;
            return (
              <div key={widget.id} data-overlay-widget={widget.kind} style={style}>
                <OverlayWidgetView
                  kind={widget.kind as OverlayKind}
                  settings={widget.settings || {}}
                  streamId={streamId}
                  stats={overlay.stats}
                  initialViewers={initialViewers}
                />
              </div>
            );
          })}
      </div>
    </OverlayEventContext.Provider>
  );
}
