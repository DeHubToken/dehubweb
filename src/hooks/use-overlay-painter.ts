/**
 * Feeds a canvas overlay painter for a creator broadcasting from the browser.
 *
 * The painter draws the creator's overlay into the outgoing video (see
 * lib/studio/overlay-painter.ts); this hook gives it everything
 * LiveOverlayLayer gives the DOM widgets — the overlay itself, refetched when
 * the creator saves; the stream's room events; chat when there is a chat box;
 * fired rules; the poll, subathon and hype train; and the creator's own
 * points board, level and top supporters, through the same queries and query
 * keys the DOM widgets use, so the two share a cache.
 *
 * Nothing is joined or fetched until `enabled`: the studio turns it on when
 * the creator goes live, and every subscription is let go when it turns off.
 * Whether the painted overlay is actually composited is the caller's call —
 * renderIn does not apply here.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveAudience } from '@/hooks/use-live-audience';
import { useLiveRoomEvents } from '@/hooks/use-live-room-events';
import { useOverlayChat } from '@/hooks/use-overlay-chat';
import { streamOverlayKey, useStreamOverlay } from '@/hooks/use-stream-overlay';
import { useStreamPoll } from '@/components/app/live/overlay/poll';
import { useStreamSubathon } from '@/components/app/live/overlay/subathon';
import { useStreamHype } from '@/components/app/live/overlay/hype-train';
import { getPointsBoard } from '@/lib/api/dehub/live-subathon';
import { getStreamerProgress } from '@/lib/api/dehub/livestream';
import type { LiveRoomEvent } from '@/lib/api/dehub/stream-presence';
import { setting } from '@/lib/live-overlay/registry';
import { createOverlayPainter, visibleWidgets, type OverlayPainter } from '@/lib/studio/overlay-painter';

export interface UseOverlayPainterOptions {
  streamId: string | null | undefined;
  /** The post's token id: the stream's chat room is keyed on it, not on streamId. */
  tokenId?: string | number | null;
  /** The creator's address, for the points board and streamer level. */
  creator?: string | null;
  enabled: boolean;
  /** The audience figure to start from, until the room sends one. */
  initialViewers?: number;
}

export function useOverlayPainter({ streamId, tokenId, creator, enabled, initialViewers }: UseOverlayPainterOptions): OverlayPainter | null {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const live = enabled && !!streamId;

  // Made in an effect, not a memo, so StrictMode's double mount disposes the
  // spare one instead of leaking its image loads.
  const [painter, setPainter] = useState<OverlayPainter | null>(null);
  useEffect(() => {
    if (!live) return;
    const next = createOverlayPainter();
    setPainter(next);
    return () => {
      next.dispose();
      setPainter(null);
    };
  }, [live]);
  // Socket handlers are bound once; they reach the current painter through this.
  const painterRef = useRef<OverlayPainter | null>(null);
  useEffect(() => {
    painterRef.current = painter;
  }, [painter]);

  // The creator's language, which is what their overlay speaks everywhere else.
  useEffect(() => {
    painter?.setTranslator((key, options) => String(t(key, options as never)));
  }, [painter, t]);

  // ── The overlay, and what it asks for ──────────────────────────────────────
  const { data: overlay } = useStreamOverlay(streamId, live);
  useEffect(() => {
    painter?.setOverlay(overlay ?? null);
  }, [painter, overlay]);

  const kinds = useMemo(() => new Set(visibleWidgets(overlay, false).map((w) => w.kind)), [overlay]);
  const settingsOf = (kind: string) => overlay?.widgets.find((w) => w.enabled && w.kind === kind)?.settings;

  useEffect(() => {
    if (painter && initialViewers != null) painter.setViewerCount(initialViewers);
  }, [painter, initialViewers]);

  // ── Room events and chat ───────────────────────────────────────────────────
  const supporterRefetch = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (supporterRefetch.current) clearTimeout(supporterRefetch.current);
    },
    [],
  );
  const hasSupporters = kinds.has('top_supporters');

  useLiveRoomEvents(streamId, live, (event) => {
    if (event.type === 'overlayUpdated') {
      void queryClient.invalidateQueries({ queryKey: streamOverlayKey(streamId) });
      return;
    }
    painterRef.current?.publish(event);
    // The board counts what the chain paid; debounced so a burst of gifts is one refetch.
    if (event.type === 'tipConfirmed' && hasSupporters && !supporterRefetch.current) {
      supporterRefetch.current = setTimeout(() => {
        supporterRefetch.current = null;
        void queryClient.invalidateQueries({ queryKey: ['live-audience', streamId] });
      }, 1500);
    }
  });

  const publishChat = useMemo(() => (event: LiveRoomEvent) => painterRef.current?.publish(event), []);
  useOverlayChat(tokenId, live && kinds.has('chat_box'), publishChat);

  // Fired stream rules: alerts and wheels. Sounds and read-aloud are the
  // studio's to play into the broadcast's audio, not the painter's.
  const hasRules = kinds.has('rule_alert') || kinds.has('spin_wheel');
  useEffect(() => {
    if (!live || !hasRules || !streamId) return;
    let cancelled = false;
    let sub: { leave: () => void } | null = null;
    import('@/lib/api/dehub/overlay-control')
      .then(({ watchStreamRules }) => {
        if (!cancelled) sub = watchStreamRules(streamId, (fired) => painterRef.current?.fireRule(fired));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.leave();
    };
  }, [live, hasRules, streamId]);

  // ── State the server keeps ─────────────────────────────────────────────────
  // A poll is drawn whether or not the creator placed the widget: they started it to be seen.
  const { poll } = useStreamPoll(live ? streamId : null, false);
  useEffect(() => {
    painter?.setPoll(poll);
  }, [painter, poll]);

  const subathon = useStreamSubathon(live ? streamId : null, overlay?.subathon);
  useEffect(() => {
    painter?.setSubathon(subathon);
  }, [painter, subathon]);

  const hype = useStreamHype(live && kinds.has('hype_train') ? streamId : null);
  useEffect(() => {
    painter?.setHype(hype);
  }, [painter, hype]);

  const { data: audience } = useLiveAudience(streamId, { enabled: live && hasSupporters });
  useEffect(() => {
    if (painter && audience) painter.setTopSupporters(audience.topTippers);
  }, [painter, audience]);

  // Same keys as the DOM widgets' queries, so a studio preview and the painter share one fetch.
  const pointsCount = Math.min(10, Math.max(1, setting(settingsOf('points_board'), 'count', 5)));
  const { data: points } = useQuery({
    queryKey: ['points-board', creator ?? '', pointsCount],
    queryFn: () => getPointsBoard(creator ?? '', pointsCount),
    enabled: live && !!creator && kinds.has('points_board'),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  useEffect(() => {
    if (painter && points) painter.setPointsBoard(points);
  }, [painter, points]);

  const { data: progress } = useQuery({
    queryKey: ['streamer-progress', creator ?? ''],
    queryFn: () => getStreamerProgress(creator ?? ''),
    enabled: live && !!creator && kinds.has('streamer_level'),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  useEffect(() => {
    painter?.setStreamerLevel(
      progress ? { level: progress.level, progressToNext: progress.progressToNext, currentStreakWeeks: progress.currentStreakWeeks } : null,
    );
  }, [painter, progress]);

  return painter;
}
