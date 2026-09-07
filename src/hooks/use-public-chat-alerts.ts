/**
 * Public chat alerts — being told the room is talking, without being buried
 * ========================================================================
 *
 * Public chat is the one room on DeHub that anybody can post in, and until now
 * it was the one feed that could never reach you: no unread badge, no
 * notification, nothing. If you were not looking at the panel it may as well
 * have been off. This is the opt-in that fixes that, and the two rules that
 * keep it survivable.
 *
 * **One card, not one per message.** Messages are buffered while the tab is in
 * the background and described as a pile — "14 new messages in public chat,
 * @ben and 4 others" — under a fixed notification tag, so the OS replaces the
 * standing card instead of stacking a new one behind it. A conversation is a
 * burst by nature; announcing each line of it is how a chat notification turns
 * into a wall the reader clears rather than reads.
 *
 * **A budget the reader sets.** An open room will be raided eventually, and a
 * digest per burst still fires as fast as the bursts arrive. The reader picks a
 * ceiling of cards per hour (see lib/public-chat-alerts for why 69 is the top
 * of the dial). Spending it delays the next card and nothing else — the buffer
 * keeps growing behind the limit and the next card that fires carries
 * everything since the last one. So a raid does not cost you the message a
 * friend sent in the middle of it; it costs you the timeliness of hearing
 * about it.
 *
 * A message that names you skips to the front of its own digest, because the
 * one line in a busy room you would have wanted pulled out is the one aimed at
 * you.
 *
 * ── Where it does NOT fire ──
 * Only while the tab is hidden. An OS notification is suppressed by most
 * browsers while the page has focus anyway, and a toast per chat message is
 * the thing this feature exists to avoid. Coming back to the tab drops the
 * buffer: you are looking at the room, so there is nothing left to tell you.
 *
 * @module hooks/use-public-chat-alerts
 */

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import {
  getStoredEnabled,
  useBrowserNotifications,
  useStoredEnabled,
} from '@/hooks/use-browser-notifications';
import { isQuietNow } from '@/lib/quiet-hours';
import { buildAvatarUrl } from '@/lib/media-url';
import {
  PUBLIC_CHAT_ALLOWANCE_CHANNEL,
  usePublicChatAlertsEnabled,
  usePublicChatAlertsPerHour,
} from '@/lib/public-chat-alerts';
import {
  buildDigest,
  claimAllowance,
  readAllowance,
  type DigestItem,
} from '@/lib/notification-digest';

/**
 * How long to let a burst finish arriving before describing it. Long enough
 * that a back-and-forth between two people is one card rather than six, short
 * enough that a quiet room still reaches you while the message is current.
 */
const FLUSH_DELAY_MS = 8_000;

/**
 * The buffer keeps the newest few for the names and the quoted line; the count
 * of everything is tracked separately. A raid must not grow the heap in a tab
 * nobody is looking at.
 */
const MAX_BUFFERED = 40;

/** Fixed tag: the OS replaces the standing public-chat card rather than stacking. */
const NOTIFICATION_TAG = 'dehub-public-chat';

/** Where the card sends you. MessagesPage opens the room off this state. */
const PUBLIC_CHAT_ROUTE = '/app/messages';

/**
 * The chat stack is loaded only once the reader has opted in.
 *
 * This hook mounts with the app shell, so a static import would put the
 * socket.io client and the whole livechat module on the boot path for
 * everybody — 50 KB parsed before first paint, for a feature that is off by
 * default. Anyone who has it on is a click away from opening the chat panel,
 * which loads the same modules anyway.
 */
async function loadChatStack() {
  const [{ getLiveChatRooms }, socket, { socketMsgToLocal }, { isAssistantAddress }] =
    await Promise.all([
      import('@/lib/api/dehub/livechat'),
      import('@/lib/api/dehub/socket'),
      import('@/hooks/use-livechat'),
      import('@/lib/assistant'),
    ]);
  return { getLiveChatRooms, socket, socketMsgToLocal, isAssistantAddress };
}

/** True when a card raised right now would actually be displayed. */
function canNotifyNow(): boolean {
  if (typeof document === 'undefined' || !document.hidden) return false;
  if (!getStoredEnabled()) return false;
  if (isQuietNow()) return false;
  if (typeof Notification === 'undefined') return false;
  return Notification.permission === 'granted';
}

export function usePublicChatAlerts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, user } = useAuth();
  const alertsOn = usePublicChatAlertsEnabled();
  const perHour = usePublicChatAlertsPerHour();
  // The master browser-notifications switch. Public chat rides the same
  // permission and the same delivery path, so with it off there is nothing to
  // subscribe for — don't hold a socket open to buffer messages nobody can be
  // told about.
  const browserNotificationsOn = useStoredEnabled();
  const { showNotification } = useBrowserNotifications();

  /** Newest first is not worth the churn; oldest-first matches buildDigest. */
  const bufferRef = useRef<DigestItem[]>([]);
  /** Everything buffered since the last card, including what the buffer dropped. */
  const totalRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read through refs so the socket subscription is rebuilt only when the room
  // or the signed-in account changes — not on every render or rate change.
  const perHourRef = useRef(perHour);
  perHourRef.current = perHour;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const showNotificationRef = useRef(showNotification);
  showNotificationRef.current = showNotification;
  const tRef = useRef(t);
  tRef.current = t;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const discard = useCallback(() => {
    bufferRef.current = [];
    totalRef.current = 0;
    clearTimer();
  }, [clearTimer]);

  /**
   * Describe what is buffered and, if the budget allows, say it.
   *
   * The three ways out matter as much as the notification does:
   *  · the reader came back to the tab → drop it, they can see the room;
   *  · delivery is off right now (permission, quiet hours) → drop it, there is
   *    no card to schedule and holding the pile forever helps nobody;
   *  · the budget is spent → keep the pile, come back when a slot frees.
   */
  const flush = useCallback(() => {
    timerRef.current = null;
    if (!bufferRef.current.length) return;

    if (!canNotifyNow()) {
      // Visible tab means read; anything else means undeliverable. Either way
      // the pile has served its purpose.
      discard();
      return;
    }

    const limit = perHourRef.current;
    if (!claimAllowance(PUBLIC_CHAT_ALLOWANCE_CHANNEL, limit)) {
      const { nextAt } = readAllowance(PUBLIC_CHAT_ALLOWANCE_CHANNEL, limit);
      // nextAt is null only when the limit is 0, which the preference clamps
      // away; guard anyway rather than busy-wait.
      if (nextAt === null) return;
      clearTimer();
      timerRef.current = setTimeout(flush, Math.max(1_000, nextAt - Date.now()));
      return;
    }

    const digest = buildDigest(bufferRef.current);
    const count = Math.max(totalRef.current, digest.count);
    const tr = tRef.current;

    const names = digest.names.join(', ');
    const who = digest.otherNames > 0
      ? tr('digest.andOthers', { names, count: digest.otherNames })
      : names || tr('digest.someone', 'Someone');

    const title = digest.latestIsPersonal
      ? tr('publicChatAlerts.mentionTitle', 'Mentioned in public chat')
      : tr('publicChatAlerts.title', 'Public chat');

    // One message reads as itself; a pile reads as a pile. Quoting the newest
    // line under the count is what makes the card worth opening rather than
    // just worth dismissing.
    //
    // The single-message form is composed rather than translated: "name:
    // message" is two placeholders and a colon, so every locale's translation
    // is byte-identical to English and the fan-out drops it as untranslated —
    // 55 locale files carrying a string that says nothing.
    const body = count > 1
      ? tr('publicChatAlerts.digest', '{{count}} new messages from {{who}}: {{message}}', {
          count,
          who,
          message: digest.latest,
        })
      : `${who}: ${digest.latest}`;

    const avatar = bufferRef.current[bufferRef.current.length - 1]?.avatar;

    discard();
    showNotificationRef.current(
      title,
      body,
      avatar,
      // Fresh id every time (the helper shows an id only once), fixed tag so
      // the OS rewrites the standing card instead of stacking a new one.
      `${NOTIFICATION_TAG}-${Date.now()}`,
      () => navigateRef.current(PUBLIC_CHAT_ROUTE, { state: { openPublicChat: true } }),
      NOTIFICATION_TAG,
    );
  }, [clearTimer, discard]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Coming back to the tab is the reader seeing the room. Nothing buffered is
  // news any more, and a card fired seconds after they returned would be pure
  // noise.
  useEffect(() => {
    if (!alertsOn) return;
    const onVisible = () => {
      if (!document.hidden) discard();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [alertsOn, discard]);

  useEffect(() => {
    if (!alertsOn || !browserNotificationsOn || !isAuthenticated) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let leave: (() => void) | null = null;

    const me = walletAddress?.toLowerCase() || '';
    const handle = user?.username?.toLowerCase() || '';

    void (async () => {
      // The platform room's id comes from the API like it does for every other
      // chat surface, so this joins the same room the panel does and shares its
      // connection rather than opening a second one.
      let chat: Awaited<ReturnType<typeof loadChatStack>>;
      let roomId: string | null = null;
      try {
        chat = await loadChatStack();
        const rooms = await chat.getLiveChatRooms();
        roomId = rooms[0]?.id ?? null;
      } catch {
        return;
      }
      if (!roomId || cancelled) return;

      const { socket, socketMsgToLocal, isAssistantAddress } = chat;
      socket.joinRoom(roomId);
      leave = () => socket.leaveRoom(roomId!);

      unsubscribe = socket.onLiveChatMessage(roomId, (raw) => {
        // Buffer only what the reader cannot already see. A visible tab is a
        // reader who is either in the room or one click from it.
        if (!document.hidden) return;

        const msg = socketMsgToLocal(raw, roomId!);
        if (!msg) return;

        const from = msg.sender_address?.toLowerCase() || '';
        if (from && from === me) return;
        // The buy bot and the assistant have their own surfaces in the panel
        // and their own switches; they are not somebody talking to the room.
        if (isAssistantAddress(from)) return;

        const text = msg.content?.trim()
          || (msg.message_type === 'audio'
            ? tRef.current('publicChatAlerts.voiceMessage', 'Voice message')
            : msg.image_url
              ? tRef.current('publicChatAlerts.image', 'Sent an image')
              : '');
        if (!text) return;

        const name = msg.sender_display_name
          || (msg.sender_username ? `@${msg.sender_username}` : '')
          || (from ? `${from.slice(0, 6)}…` : '')
          || tRef.current('digest.someone', 'Someone');

        totalRef.current += 1;
        bufferRef.current.push({
          from: name,
          text,
          // A handle match is deliberately loose — mentions are typed by hand
          // and the room writes them plenty of ways.
          personal: Boolean(handle && msg.content?.toLowerCase().includes(`@${handle}`)),
          avatar: buildAvatarUrl(msg.sender_address || '', msg.sender_avatar_url) || undefined,
        });
        if (bufferRef.current.length > MAX_BUFFERED) {
          bufferRef.current = bufferRef.current.slice(-MAX_BUFFERED);
        }

        // First message of a pile starts the clock; the rest join the card it
        // is going to produce. Never re-armed on arrival, or a room that never
        // stops talking would never fire.
        if (timerRef.current === null) {
          timerRef.current = setTimeout(() => flushRef.current(), FLUSH_DELAY_MS);
        }
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      leave?.();
      discard();
    };
  }, [alertsOn, browserNotificationsOn, isAuthenticated, walletAddress, user?.username, discard]);
}
