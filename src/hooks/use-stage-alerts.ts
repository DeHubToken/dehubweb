/**
 * Stage alerts — "starting soon" and "it's live", as they happen
 * ==============================================================
 * The persistent half is server-side and already worked: a trigger on
 * audio_spaces fans a `stage_live` row into custom_notifications the moment a
 * host starts a stage, a pg_cron pass writes `stage_reminder` rows ten minutes
 * ahead of a scheduled start, and the notifications page renders, badges and
 * routes both. What was missing is being told while it still matters, wherever
 * you are in the app.
 *
 * Two arrival paths, because the two events differ in how fast they have to land:
 *
 *  · **live** — instant, off an audio_spaces realtime event. A stage that has
 *    started is worth interrupting for; a minute late is a minute of the room
 *    missed.
 *  · **starting soon** — off the app-wide unread count that is already polled
 *    for the bell badge. A ten-minute warning tolerates arriving a few minutes
 *    in, and riding an existing query costs no extra request. This path also
 *    backstops the live one: if the realtime event is missed, the count rising
 *    still catches it.
 *
 * ── Why the live path listens to audio_spaces and not custom_notifications ──
 *
 * The obvious build is a realtime subscription on your own notification rows.
 * It delivers nothing, silently. Realtime applies RLS, and that table's SELECT
 * policy is `lower(recipient_address) = get_request_wallet_address()` — a
 * function that reads the `x-wallet-address` request header, which a websocket
 * has no way to send. The subscription connects, reports itself SUBSCRIBED and
 * never emits an event. audio_spaces and stage_reminders are both
 * `USING (true)`, so the transition and "do I hold a reminder" are readable
 * without the header. Ordinary fetches are fine — withWalletHeader sets it —
 * which is why the second path can read the rows directly.
 *
 * ── Detecting the transition without OLD.status ──
 *
 * audio_spaces has REPLICA IDENTITY DEFAULT, so an UPDATE payload's `old`
 * carries the primary key and nothing else: `scheduled → live` is
 * indistinguishable from a listener_count bump by comparing statuses. What is
 * reliable is `started_at`, which startScheduledSpace stamps at the moment of
 * the flip — so "status is live AND started_at is seconds old AND we have not
 * already announced this stage" identifies it, and survives the duplicate
 * events a reconnect replays.
 *
 * A stage opened with "Go live now" also has a fresh started_at, but it never
 * had a scheduled phase for anyone to set a reminder on, so the reminder lookup
 * drops it. The host is excluded too: they pressed the button.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { useBrowserNotifications } from '@/hooks/use-browser-notifications';
import { customNotificationKeys, useCustomUnreadCount } from '@/hooks/use-custom-notifications';
import {
  stageLiveSentence,
  stageReminderSentence,
  stageNotificationPath,
} from '@/lib/stage-notifications';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import type { AudioSpace } from '@/types/audio-spaces.types';

/**
 * How fresh `started_at` has to be for a live row to count as "just started".
 * Generous enough to cover a slow trigger, a reconnect replaying the event and a
 * clock a little out of step with the server; short enough that opening the app
 * during a stage that has been running for an hour announces nothing.
 */
const JUST_STARTED_MS = 2 * 60 * 1000;

/**
 * How recent a notification row has to be for the count-driven path to announce
 * it. This is load-bearing, not a nicety: the query asks for *unread* stage
 * rows, and an unread row can sit there for weeks. Without a freshness window,
 * an unrelated notification nudging the count up would replay a stale
 * "starting soon" for a stage that came and went.
 */
const FRESH_ROW_MS = 15 * 60 * 1000;

/** Rows pulled when the count rises — a burst is a handful, never a backlog. */
const ROW_FETCH_LIMIT = 5;

type StageAlertType = 'stage_live' | 'stage_reminder';

export function useStageAlerts() {
  const { isAuthenticated, walletAddress } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showNotification } = useBrowserNotifications();
  // Shares the query the bell badge already polls, so subscribing here adds no
  // request of its own.
  const { data: unreadCount } = useCustomUnreadCount();

  /**
   * Alerts already raised, keyed by type + destination so the realtime path and
   * the count path cannot both announce the same stage. Session-scoped on
   * purpose: a reload is a fresh start, and the persistent bell row is the
   * record that survives.
   */
  const alertedRef = useRef<Set<string>>(new Set());
  /** Previous unread count; null until the first reading is in. */
  const lastUnreadRef = useRef<number | null>(null);

  // Read through refs so the realtime subscription is rebuilt only when the
  // signed-in wallet changes — not on every navigation.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const showNotificationRef = useRef(showNotification);
  showNotificationRef.current = showNotification;

  /**
   * Raise one alert. A hidden tab gets the OS notification (clicking it focuses
   * the tab and opens the stage); a visible tab gets a toast, because an OS
   * notification is suppressed while the tab has focus and would otherwise be
   * the only alert. Mutually exclusive, so nothing announces twice.
   */
  const raise = useCallback((args: {
    type: StageAlertType;
    path: string;
    heading: string;
    sentence: string;
    avatar?: string;
  }) => {
    const key = `${args.type}@${args.path}`;
    if (alertedRef.current.has(key)) return;
    alertedRef.current.add(key);

    const open = () => navigateRef.current(args.path);

    if (document.hidden) {
      showNotificationRef.current(args.heading, args.sentence, args.avatar, key, open);
    } else {
      toast.success(args.sentence, {
        duration: 12_000,
        action: {
          label: args.type === 'stage_live' ? 'Listen in' : 'View stage',
          onClick: open,
        },
      });
    }
  }, []);

  // ── Path 1: a stage just went live ──────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;
    const wallet = walletAddress.toLowerCase();

    const announce = async (space: AudioSpace) => {
      if (space.status !== 'live' || !space.id) return;

      const startedAt = space.started_at ? new Date(space.started_at).getTime() : 0;
      if (!startedAt || Date.now() - startedAt > JUST_STARTED_MS) return;

      // The host pressed the button; they do not need telling.
      if (space.host_wallet_address?.toLowerCase() === wallet) return;

      const path = stageNotificationPath(
        space.short_id != null ? String(space.short_id) : space.id,
      );
      // Bail before the round trip if this stage has already been announced.
      if (alertedRef.current.has(`stage_live@${path}`)) return;

      const { data: reminder, error } = await supabase
        .from('stage_reminders')
        .select('id')
        .eq('space_id', space.id)
        .eq('wallet_address', wallet)
        .maybeSingle();
      if (error || !reminder) return;

      // The trigger has written the bell row by now; pull it in rather than
      // leaving the badge to the poll.
      void queryClient.invalidateQueries({ queryKey: customNotificationKeys.all });

      const actorName = space.host_username ? `@${space.host_username}` : 'Someone';
      raise({
        type: 'stage_live',
        path,
        heading: space.title || 'A stage is live',
        sentence: stageLiveSentence(actorName, space.title),
        avatar:
          buildAvatarUrl(space.host_wallet_address || '', space.host_avatar) ||
          buildAvatarCdnFallbackUrl(space.host_wallet_address || ''),
      });
    };

    const channel = supabase
      .channel(`stage_alerts:${wallet}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'audio_spaces',
          // Realtime filters match the NEW row, so this drops every update that
          // lands a stage on scheduled or ended before it reaches the client.
          filter: 'status=eq.live',
        },
        (payload) => { void announce(payload.new as AudioSpace); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, walletAddress, raise]);

  // ── Path 2: the unread count rose, so read what arrived ─────────────────
  //
  // Carries "starting soon" (written by the pre-start cron, which no realtime
  // event corresponds to) and backstops path 1.
  useEffect(() => {
    if (typeof unreadCount !== 'number' || !walletAddress) return;

    const previous = lastUnreadRef.current;
    lastUnreadRef.current = unreadCount;
    // The first reading only establishes the baseline. Announcing on it would
    // replay every unread stage row every time the app is opened.
    if (previous === null || unreadCount <= previous) return;

    const wallet = walletAddress.toLowerCase();
    void (async () => {
      const { data, error } = await withWalletHeader(
        supabase
          .from('custom_notifications')
          .select('id, type, reference_id, reference_title, actor_username, actor_address, actor_avatar')
          .eq('recipient_address', wallet)
          .eq('read', false)
          .in('type', ['stage_live', 'stage_reminder'])
          .gte('created_at', new Date(Date.now() - FRESH_ROW_MS).toISOString())
          .order('created_at', { ascending: true })
          .limit(ROW_FETCH_LIMIT),
        wallet,
      );
      if (error || !data?.length) return;

      for (const row of data) {
        const type = row.type as StageAlertType;
        if (type !== 'stage_live' && type !== 'stage_reminder') continue;

        const path = stageNotificationPath(row.reference_id);
        const actorName = row.actor_username ? `@${row.actor_username}` : 'Someone';
        raise({
          type,
          path,
          heading: row.reference_title || 'DeHub Stages',
          sentence:
            type === 'stage_live'
              ? stageLiveSentence(actorName, row.reference_title)
              : stageReminderSentence(row.reference_title),
          avatar:
            buildAvatarUrl(row.actor_address || '', row.actor_avatar) ||
            buildAvatarCdnFallbackUrl(row.actor_address || ''),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount, walletAddress, raise]);
}
