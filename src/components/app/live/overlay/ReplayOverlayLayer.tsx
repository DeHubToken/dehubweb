/**
 * A creator's overlay over the REPLAY of a stream.
 *
 * Overlays drawn in the viewer's app are not in the recording — that is the
 * one thing the in-app route gives up. This puts them back without touching
 * the video: the stream's own activity log (paid gifts, joins, reactions) is
 * played into the same widgets at the moment each happened, against the
 * replay's clock. Seeking jumps without replaying what was skipped.
 *
 * Only for overlays drawn in the app: an OBS stream already has them burned
 * into its recording. Loaded on demand by the live card, which is on the boot
 * path.
 */
import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import '@/styles/live-overlay.css';
import { apiCall } from '@/lib/api/dehub/core';
import type { LiveRoomEvent } from '@/lib/api/dehub/stream-presence';
import { useVideoPictureRect } from '@/hooks/use-video-picture-rect';
import { drawOrder, placeWidget, rectFor } from '@/lib/live-overlay/layout';
import { isKnownKind, type OverlayKind } from '@/lib/live-overlay/registry';
import type { OverlayWidget, PublicOverlay } from '@/lib/live-overlay/types';
import { createOverlayEventBus, OverlayEventContext } from './overlay-events';
import { OverlayWidgetView } from './overlay-widgets';

/** Widgets the log can drive. Live-only ones (polls, rules, chat, viewer counts, timers) stay off a replay. */
const REPLAYABLE = new Set(['tip_alert', 'join_alert', 'goal_bar', 'top_supporters', 'text', 'frame', 'reaction_counter', 'event_feed', 'ticker']);
const PAGE = 200;
const MAX_PAGES = 5;
/** A jump in the replay clock bigger than this is a seek, not playback: skip what lies between. */
const SEEK_MS = 4000;

interface Timed {
  at: number;
  events: LiveRoomEvent[];
}

interface Props {
  streamId: string;
  overlay: PublicOverlay;
  videoRef: RefObject<HTMLVideoElement | null>;
}

function userOf(raw: any) {
  const a = raw?.account ?? {};
  const m = raw?.meta ?? {};
  return {
    address: String(raw?.address || m.address || '').toLowerCase(),
    username: a.username || m.username || undefined,
    displayName: a.displayName || m.displayName || undefined,
    avatarImageUrl: a.avatarImageUrl || m.avatarImageUrl || undefined,
  };
}

/** The log, oldest first, as room events at their offset from the stream's start. */
async function loadTimeline(streamId: string): Promise<Timed[]> {
  const rows: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await apiCall<any>(`/api/live/${encodeURIComponent(streamId)}/activities`, {
      params: { limit: PAGE, skip: page * PAGE, order: 'asc' },
    });
    const batch: any[] = Array.isArray(res) ? res : Array.isArray(res?.result) ? res.result : [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  const start = rows.find((r) => r?.status === 'START') ?? rows[0];
  const t0 = start?.createdAt ? new Date(start.createdAt).getTime() : NaN;
  if (!Number.isFinite(t0)) return [];

  const out: Timed[] = [];
  for (const r of rows) {
    const at = new Date(r?.createdAt).getTime() - t0;
    if (!Number.isFinite(at) || at < 0) continue;
    const user = userOf(r);
    const m = r?.meta ?? {};
    if (r.status === 'TIP' && m.paymentStatus === 'confirmed') {
      const paid = Number(m.paidAmount ?? m.amount) || 0;
      if (paid <= 0) continue;
      const transactionHash = String(m.transactionHash || r._id || '');
      out.push({
        at,
        events: [
          { type: 'tip', amount: paid, selectedTier: m.selectedTier || undefined, user, message: m.message || undefined, transactionHash },
          { type: 'tipConfirmed', paidAmount: paid, address: user.address, transactionHash, user },
        ],
      });
    } else if (r.status === 'JOINED' && user.address) {
      out.push({ at, events: [{ type: 'join', user }] });
    } else if (r.status === 'REACTION' && typeof m.reactionType === 'string') {
      out.push({ at, events: [{ type: 'reaction', reactionType: m.reactionType, user }] });
    }
  }
  return out;
}

export default function ReplayOverlayLayer({ streamId, overlay, videoRef }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const picture = useVideoPictureRect(layerRef, videoRef);
  const bus = useMemo(() => createOverlayEventBus(), []);
  const { data: timeline } = useQuery({
    queryKey: ['replay-timeline', streamId],
    queryFn: () => loadTimeline(streamId),
    staleTime: 10 * 60_000,
  });

  const visible = useMemo(() => drawOrder(overlay.widgets.filter((w) => w.enabled && isKnownKind(w.kind) && REPLAYABLE.has(w.kind))), [overlay]);
  // A replay starts from nothing: the goal bar and reaction counter count up as it plays.
  const stats = useMemo(() => ({ ...overlay.stats, totalTips: 0, reactions: 0, startedAt: null }), [overlay.stats]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !timeline?.length) return;
    let last = video.currentTime * 1000;
    let next = timeline.findIndex((x) => x.at > last);
    if (next < 0) next = timeline.length;
    const resync = (t: number) => {
      last = t;
      next = timeline.findIndex((x) => x.at > t);
      if (next < 0) next = timeline.length;
    };
    const tick = () => {
      const t = video.currentTime * 1000;
      if (t < last || t - last > SEEK_MS) return resync(t);
      while (next < timeline.length && timeline[next].at <= t) {
        timeline[next].events.forEach((event) => bus.publish(event));
        next += 1;
      }
      last = t;
    };
    const onSeeked = () => resync(video.currentTime * 1000);
    video.addEventListener('timeupdate', tick);
    video.addEventListener('seeked', onSeeked);
    return () => {
      video.removeEventListener('timeupdate', tick);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [videoRef, timeline, bus]);

  return (
    <OverlayEventContext.Provider value={bus}>
      <div ref={layerRef} data-live-overlay aria-hidden>
        {picture.width > 0 &&
          visible.map((widget) => (
            <div key={widget.id} data-overlay-widget={widget.kind} style={boxStyle(widget, picture)}>
              <OverlayWidgetView kind={widget.kind as OverlayKind} settings={widget.settings || {}} streamId={streamId} stats={stats} initialViewers={0} />
            </div>
          ))}
      </div>
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
