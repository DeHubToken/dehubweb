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
import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import '@/styles/live-overlay.css';
import { useLiveRoomEvents } from '@/hooks/use-live-room-events';
import { useOverlayChat } from '@/hooks/use-overlay-chat';
import { streamOverlayKey } from '@/hooks/use-stream-overlay';
import { useVideoPictureRect } from '@/hooks/use-video-picture-rect';
import { drawOrder, placeWidget, rectFor } from '@/lib/live-overlay/layout';
import { isAlertKind, isKnownKind, newWidget, type OverlayKind } from '@/lib/live-overlay/registry';
import type { OverlayWidget, PublicOverlay } from '@/lib/live-overlay/types';
import { createOverlayEventBus, OverlayEventContext } from './overlay-events';
import { OverlayWidgetView } from './overlay-widgets';
import { createRuleBus, RuleAudio, RuleBusContext } from './rule-bus';
import { PollContext, PollWidget, useStreamPoll } from './poll';
import { OverlayCreatorContext, SubathonContext, useStreamSubathon } from './subathon';
import { HypeContext, useStreamHype } from './hype-train';

interface Props {
  streamId: string;
  overlay: PublicOverlay;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The post's token id: the stream's chat room is keyed on it, not on streamId. */
  tokenId?: string | number | null;
  /** The creator's address, for widgets that read the creator's own data (points). */
  creator?: string | null;
  /** The audience figure the card already shows, until the room sends one. */
  initialViewers: number;
}

export default function LiveOverlayLayer({ streamId, tokenId, overlay, videoRef, initialViewers, creator }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const picture = useVideoPictureRect(layerRef, videoRef);
  const queryClient = useQueryClient();
  const bus = useMemo(() => createOverlayEventBus(), []);

  const visible = useMemo(
    () =>
      overlay.renderIn === 'app'
        ? drawOrder(
            overlay.widgets.filter(
              (w) => w.enabled && w.kind !== 'poll' && isKnownKind(w.kind) && !(overlay.controls?.alertsPaused && isAlertKind(w.kind)),
            ),
          )
        : [],
    [overlay],
  );

  // A poll is the one thing viewers touch, so it is drawn whatever renderIn
  // says: over an OBS stream it lands on the same spot as the burned-in copy
  // and covers it with buttons. Where the creator placed it, or the default spot.
  const polls = useStreamPoll(streamId, true);
  const subathon = useStreamSubathon(streamId, overlay.subathon);
  // Only fetched when the creator placed the widget: the player's own bar covers everyone else.
  const hype = useStreamHype(overlay.widgets.some((w) => w.enabled && w.kind === 'hype_train') ? streamId : null);
  const pollWidget = useMemo(
    () => overlay.widgets.find((w) => w.enabled && w.kind === 'poll') ?? newWidget('poll', []),
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
  useOverlayChat(tokenId, visible.some((w) => w.kind === 'chat_box'), bus.publish);

  // Fired stream rules: heard here only while the overlay is drawn in the app.
  // When OBS burns it into the video, the OBS page plays them — once.
  const rules = useMemo(() => createRuleBus(), []);
  const inApp = overlay.renderIn === 'app';
  useEffect(() => {
    if (!inApp || !streamId) return;
    let cancelled = false;
    let sub: { leave: () => void } | null = null;
    import('@/lib/api/dehub/overlay-control')
      .then(({ watchStreamRules }) => {
        if (!cancelled) sub = watchStreamRules(streamId, rules.publish);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [inApp, streamId, rules]);

  return (
    <OverlayEventContext.Provider value={bus}>
    <SubathonContext.Provider value={subathon}>
    <HypeContext.Provider value={hype}>
    <OverlayCreatorContext.Provider value={creator ?? ''}>
      <RuleBusContext.Provider value={rules}>
        {inApp && <RuleAudio playLive />}
        <div ref={layerRef} data-live-overlay aria-hidden>
          {picture.width > 0 &&
            visible.map((widget) => (
              <div key={widget.id} data-overlay-widget={widget.kind} style={boxStyle(widget, picture)}>
                <OverlayWidgetView
                  kind={widget.kind as OverlayKind}
                  settings={widget.settings || {}}
                  streamId={streamId}
                  stats={overlay.stats}
                  initialViewers={initialViewers}
                />
              </div>
            ))}
        </div>
        {picture.width > 0 && polls.poll && (
          <div data-live-overlay>
            <div data-overlay-widget="poll" style={boxStyle(pollWidget, picture)}>
              <PollContext.Provider value={{ ...polls, interactive: true }}>
                <PollWidget settings={pollWidget.settings || {}} />
              </PollContext.Provider>
            </div>
          </div>
        )}
      </RuleBusContext.Provider>
    </OverlayCreatorContext.Provider>
    </HypeContext.Provider>
    </SubathonContext.Provider>
    </OverlayEventContext.Provider>
  );
}

function boxStyle(widget: OverlayWidget, picture: ReturnType<typeof useVideoPictureRect>): CSSProperties {
  const box = placeWidget(rectFor(widget, picture.portrait), picture);
  return {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    '--ow-h': `${box.height}px`,
    '--ow-w': `${box.width}px`,
  } as CSSProperties;
}
