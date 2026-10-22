/**
 * The stream's chat, for an overlay chat box.
 *
 * Chat lives in the `/livechat` namespace under `stream:<tokenId>`, not in the
 * stream room the other overlay events come from. Joining goes through the
 * shared, ref-counted connection for that room, so a viewer who also has the
 * stream's chat panel open does not get a second connection. Only opened when
 * the overlay actually has a chat box.
 */
import { useEffect, useRef } from 'react';
import type { LiveRoomEvent } from '@/lib/api/dehub/stream-presence';

export function useOverlayChat(
  tokenId: string | number | null | undefined,
  enabled: boolean,
  publish: (event: LiveRoomEvent) => void,
) {
  const publishRef = useRef(publish);
  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  useEffect(() => {
    if (!enabled || tokenId == null || tokenId === '') return;
    let cancelled = false;
    let cleanup = () => undefined as void;

    import('@/lib/api/dehub/socket')
      .then(({ joinRoom, leaveRoom, onLiveChatMessage, onMessageDeleted }) => {
        if (cancelled) return;
        const room = `stream:${tokenId}`;
        joinRoom(room);
        const offMessage = onLiveChatMessage(room, (raw: any) => {
          const text = typeof raw?.content === 'string' ? raw.content.trim() : '';
          const id = String(raw?.id ?? raw?._id ?? '');
          // Images, GIFs and voice notes have nothing to show in a line of text.
          if (!text || !id || (raw?.type && raw.type !== 'text')) return;
          const sender = raw?.sender ?? {};
          publishRef.current({
            type: 'chat',
            id,
            text,
            user: {
              address: String(sender.address || '').toLowerCase(),
              username: sender.username || undefined,
              displayName: sender.displayName || undefined,
              avatarImageUrl: sender.avatarImageUrl || sender.avatarUrl || undefined,
            },
          });
        });
        const offDeleted = onMessageDeleted(room, (data) => {
          if (data?.messageId) publishRef.current({ type: 'chatDeleted', id: String(data.messageId) });
        });
        cleanup = () => {
          offMessage();
          offDeleted();
          leaveRoom(room);
        };
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [tokenId, enabled]);
}
