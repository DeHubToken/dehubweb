/**
 * Stage went live → tell the people who asked
 * ===========================================
 * The persistent half of this already works server-side: a trigger on
 * audio_spaces fans a `stage_live` row into custom_notifications for every
 * wallet holding a reminder, and the notifications page renders and routes it.
 * What was missing is the part that matters for a live event — being told *now*,
 * wherever you are in the app, instead of finding the row later.
 *
 * ── Why this listens to audio_spaces and not custom_notifications ──
 *
 * The obvious build is a realtime subscription on custom_notifications filtered
 * to your own rows. It delivers nothing, silently. Realtime applies RLS, and
 * that table's SELECT policy is
 * `lower(recipient_address) = get_request_wallet_address()` — a function that
 * reads the `x-wallet-address` request header, which a websocket has no way to
 * send. The subscription connects, reports itself healthy and never emits an
 * event. audio_spaces and stage_reminders are both `USING (true)`, so the
 * transition and "do I hold a reminder" are readable without the header.
 *
 * ── Detecting the transition without OLD.status ──
 *
 * audio_spaces has REPLICA IDENTITY DEFAULT, so an UPDATE payload's `old`
 * carries the primary key and nothing else: `scheduled → live` is
 * indistinguishable from a listener_count bump by comparing statuses. What is
 * reliable is `started_at`, which startScheduledSpace stamps at the moment of
 * the flip — so "status is live AND started_at is seconds old AND we have not
 * already alerted for this id" identifies the transition, and survives the
 * duplicate events a reconnect replays.
 *
 * A stage opened with "Go live now" also has a fresh started_at, but it never
 * had a scheduled phase for anyone to set a reminder on, so the reminder lookup
 * drops it. The host is excluded too: they pressed the button.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBrowserNotifications } from '@/hooks/use-browser-notifications';
import { customNotificationKeys } from '@/hooks/use-custom-notifications';
import { stageLiveSentence, stageNotificationPath } from '@/lib/stage-notifications';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import type { AudioSpace } from '@/types/audio-spaces.types';

/**
 * How fresh `started_at` has to be for a live row to count as "just started".
 * Generous enough to cover a slow trigger, a reconnect replaying the event and a
 * clock a little out of step with the server; short enough that opening the app
 * during a stage that has been running for an hour announces nothing.
 */
const JUST_STARTED_MS = 2 * 60 * 1000;

export function useStageLiveAlerts() {
  const { isAuthenticated, walletAddress } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showNotification } = useBrowserNotifications();

  /** Stage ids already announced, so a replayed event cannot announce twice. */
  const alertedRef = useRef<Set<string>>(new Set());

  // Read through refs so the subscription is torn down and rebuilt only when the
  // signed-in wallet changes — not on every navigation.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const showNotificationRef = useRef(showNotification);
  showNotificationRef.current = showNotification;

  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;
    const wallet = walletAddress.toLowerCase();

    const announce = async (space: AudioSpace) => {
      if (space.status !== 'live' || !space.id) return;
      if (alertedRef.current.has(space.id)) return;

      const startedAt = space.started_at ? new Date(space.started_at).getTime() : 0;
      if (!startedAt || Date.now() - startedAt > JUST_STARTED_MS) return;

      // The host pressed the button; they do not need telling.
      if (space.host_wallet_address?.toLowerCase() === wallet) return;

      // Claim the id before the await so two events in flight cannot both pass.
      alertedRef.current.add(space.id);

      const { data: reminder, error } = await supabase
        .from('stage_reminders')
        .select('id')
        .eq('space_id', space.id)
        .eq('wallet_address', wallet)
        .maybeSingle();
      if (error || !reminder) return;

      // The trigger has written the bell row by now; pull it in rather than
      // leaving the badge to the five-minute poll.
      void queryClient.invalidateQueries({ queryKey: customNotificationKeys.all });

      const actorName = space.host_username ? `@${space.host_username}` : 'Someone';
      const sentence = stageLiveSentence(actorName, space.title);
      const path = stageNotificationPath(
        space.short_id != null ? String(space.short_id) : space.id,
      );
      const open = () => navigateRef.current(path);

      // Hidden tab → the OS tells them, and clicking it focuses the tab and
      // opens the room. Visible tab → a toast, because an OS notification is
      // suppressed while the tab has focus and would otherwise be the only
      // alert. The two are mutually exclusive, so neither doubles up.
      if (document.hidden) {
        const avatar =
          buildAvatarUrl(space.host_wallet_address || '', space.host_avatar) ||
          buildAvatarCdnFallbackUrl(space.host_wallet_address || '');
        showNotificationRef.current(
          space.title || 'A stage is live',
          sentence,
          avatar,
          `stage_live_${space.id}`,
          open,
        );
      } else {
        toast.success(sentence, {
          duration: 12_000,
          action: { label: 'Listen in', onClick: open },
        });
      }
    };

    const channel = supabase
      .channel(`stage_live_alerts:${wallet}`)
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
  }, [isAuthenticated, walletAddress]);
}
