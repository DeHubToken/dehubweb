import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  getLiveChatRooms,
  getLiveChatRoom,
  getLiveChatMessages as fetchApiMessages,
  getLiveChatUserProfile,
  getLiveChatOnlineCount,
  type LiveChatRoom,
  type LiveChatMessage,
  type LiveChatUserProfile,
} from '@/lib/api/dehub';
import {
  getSocket, joinRoom, leaveRoom, emitSendMessage,
  onLiveChatMessage, onRoomJoined, onMessageDeleted,
  onUserBanned, onUserUnbanned, onReactionUpdated,
  emitAddReaction, emitRemoveReaction, debugSocketEvents,
} from '@/lib/api/dehub/socket';
import { useAuth } from '@/contexts/AuthContext';
import type { ReactionData, ReplyToData } from '@/components/app/chat/ChatMessage';

/** Shape of a livechat message used internally in the UI */
export interface SupabaseLiveChatMessage {
  id: string;
  room_id: string;
  sender_address: string;
  sender_username: string | null;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  content: string;
  message_type: string;
  image_url: string | null;
  is_pinned: boolean;
  created_at: string;
  reactions?: ReactionData;
  reply_to?: {
    id: string;
    content: string;
    sender_name: string;
  };
}

export function useLiveChatRooms() {
  const [rooms, setRooms] = useState<LiveChatRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  const fetchRooms = useCallback(() => {
    setIsLoading(true);
    setError(null);
    getLiveChatRooms()
      .then((data) => {
        setRooms(data);
        if (data.length === 0) {
          console.warn('[LiveChat] Rooms loaded but list is empty');
        }
      })
      .catch((err) => {
        console.error('[LiveChat] Failed to fetch rooms:', err);
        setError(err?.message || 'Failed to load chat rooms');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms, isAuthenticated]);

  return { rooms, isLoading, error, refetch: fetchRooms };
}

/** Parse reaction data from API — could be { emoji: [addr] } or { emoji: count } */
function parseReactions(raw: unknown): ReactionData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const result: ReactionData = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      result[key] = val as string[];
    } else if (typeof val === 'number' && val > 0) {
      // If API only gives counts, create placeholder array
      result[key] = Array.from({ length: val }, (_, i) => `unknown-${i}`);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Parse reply-to data from API */
function parseReplyTo(raw: unknown): { id: string; content: string; sender_name: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const id = r.id || r._id || r.messageId;
  if (!id) return undefined;
  const sender = r.sender as Record<string, unknown> | undefined;
  // Try nested sender object first, then top-level fields
  const senderName =
    sender?.displayName || sender?.username || sender?.name ||
    r.senderDisplayName || r.senderUsername || r.sender_display_name || r.sender_username ||
    r.displayName || r.username || r.name ||
    sender?.address ||
    'Unknown';
  return {
    id: String(id),
    content: String(r.content || r.message || ''),
    sender_name: String(senderName),
  };
}

/** Convert a DeHub API message to our internal format */
function apiMsgToLocal(msg: LiveChatMessage & { gif?: { url?: string } }, roomId?: string): SupabaseLiveChatMessage {
  const raw = msg as unknown as Record<string, unknown>;
  const gifUrl = raw?.gif && typeof raw.gif === 'object' && (raw.gif as Record<string, unknown>)?.url;
  return {
    id: msg.id,
    room_id: msg.roomId || roomId || '',
    sender_address: msg.sender?.address || '',
    sender_username: msg.sender?.username || null,
    sender_display_name: msg.sender?.displayName || null,
    sender_avatar_url: msg.sender?.avatarUrl || msg.sender?.avatarImageUrl || null,
    content: msg.content || (typeof gifUrl === 'string' ? gifUrl : ''),
    message_type: msg.type || msg.messageType || 'text',
    image_url: msg.imageUrl || (typeof gifUrl === 'string' ? gifUrl : null) || ((raw as any).media?.[0]?.url ?? null),
    is_pinned: msg.isPinned || false,
    created_at: msg.createdAt,
    reactions: parseReactions(msg.reactions || (raw as any).reactions),
    reply_to: parseReplyTo((raw as any).replyTo || (raw as any).reply_to || (raw as any).parentMessage),
  };
}

/** Deduplicate messages by id, keeping latest version but preserving rich reply_to data */
function deduplicateMessages(msgs: SupabaseLiveChatMessage[]): SupabaseLiveChatMessage[] {
  const seen = new Map<string, SupabaseLiveChatMessage>();
  for (const m of msgs) {
    const existing = seen.get(m.id);
    if (existing) {
      // Preserve good reply_to data if the new version has incomplete info
      const merged = { ...m };
      if (existing.reply_to && (!merged.reply_to || merged.reply_to.sender_name === 'Unknown' || merged.reply_to.sender_name === 'User')) {
        merged.reply_to = existing.reply_to;
      }
      seen.set(m.id, merged);
    } else {
      seen.set(m.id, m);
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/** Module-level cache so remounts (auth flicker, navigate back) show last-known messages */
const liveChatMessagesCache = new Map<string, SupabaseLiveChatMessage[]>();

/** Normalize socket message to our format */
function socketMsgToLocal(msg: unknown, roomId: string): SupabaseLiveChatMessage | null {
  const m = msg as Record<string, unknown>;
  if (!m || typeof m !== 'object') return null;
  const id = String(m.id ?? m._id ?? '');
  if (!id) return null;
  const sender = m.sender as Record<string, unknown> | undefined;
  return {
    id,
    room_id: roomId,
    sender_address: (sender?.address ?? m.senderAddress ?? '') as string,
    sender_username: (sender?.username ?? m.senderUsername ?? null) as string | null,
    sender_display_name: (sender?.displayName ?? sender?.display_name ?? m.senderDisplayName ?? null) as string | null,
    sender_avatar_url: (sender?.avatarUrl ?? sender?.avatarImageUrl ?? sender?.avatar_image_url ?? m.imageUrl ?? null) as string | null,
    content: (m.content ?? '') as string,
    message_type: (m.type ?? m.messageType ?? m.message_type ?? 'text') as string,
    image_url: (m.imageUrl ?? m.image_url ?? null) as string | null,
    is_pinned: (m.isPinned ?? m.is_pinned ?? false) as boolean,
    created_at: (m.createdAt ?? m.created_at ?? new Date().toISOString()) as string,
    reactions: parseReactions(m.reactions),
    reply_to: parseReplyTo(m.replyTo || m.reply_to || m.parentMessage),
  };
}

/**
 * Livechat messages hook.
 */
export function useLiveChatMessages(roomId: string | null) {
  const [messages, setMessages] = useState<SupabaseLiveChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const { isAuthenticated, user, walletAddress } = useAuth();
  const initialLoadDone = useRef(false);

  const fetchMessages = useCallback(async (showLoading = false) => {
    if (!roomId) return;
    if (showLoading) setIsLoading(true);
    try {
      const apiMessages = await fetchApiMessages(roomId, { limit: 200 });
      const mapped = apiMessages.map((m) => apiMsgToLocal(m, roomId));
      setMessages((prev) => {
        const optimistic = prev.filter((m) => m.id.startsWith('temp-'));
        const keepOptimistic = optimistic.filter(
          (temp) =>
            !mapped.some(
              (real) =>
                real.content === temp.content && real.sender_address === temp.sender_address
            )
        );
        const next = deduplicateMessages([...mapped, ...keepOptimistic]);
        liveChatMessagesCache.set(roomId, next);
        return next;
      });
    } catch (err) {
      console.error('[LiveChat] REST messages fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }
    const cached = liveChatMessagesCache.get(roomId);
    if (cached?.length) setMessages(cached);
    fetchMessages(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Socket connection for real-time updates
  useEffect(() => {
    if (!roomId) return;

    initialLoadDone.current = false;

    const unsubDebug = debugSocketEvents();
    const socket = getSocket();
    setIsConnected(socket.connected);

    const onConnect = () => {
      setIsConnected(true);
      joinRoom(roomId);
    };
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) {
      joinRoom(roomId);
    }

    const unsubJoined = onRoomJoined((data) => {
      console.log('[LiveChat] Room joined, banned:', data.isBanned);
      setIsBanned(data.isBanned || false);
      initialLoadDone.current = true;
    });

    const unsubMsg = onLiveChatMessage((msg) => {
      const local = socketMsgToLocal(msg, roomId);
      if (local) {
        setMessages((prev) => {
          const withoutMatchingTemp = prev.filter(
            (x) => !(x.id.startsWith('temp-') && x.content === local.content && x.sender_address === local.sender_address)
          );
          const next = deduplicateMessages([...withoutMatchingTemp.filter((x) => x.id !== local.id), local]);
          liveChatMessagesCache.set(roomId, next);
          return next;
        });
      }
    });

    const unsubDeleted = onMessageDeleted((data) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
    });

    // Handle reaction updates from other users
    const unsubReaction = onReactionUpdated((data: unknown) => {
      const d = data as Record<string, unknown>;
      const messageId = String(d.messageId || d.message_id || '');
      if (!messageId) return;
      const reactions = parseReactions(d.reactions);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, reactions } : m
        )
      );
    });

    const unsubBanned = onUserBanned((data) => {
      setIsBanned(true);
      toast.error(data.message || 'You have been banned from chat');
    });
    const unsubUnbanned = onUserUnbanned((data) => {
      setIsBanned(false);
      toast.success(data.message || 'You have been unbanned');
    });

    return () => {
      leaveRoom(roomId);
      unsubJoined();
      unsubMsg();
      unsubDeleted();
      unsubReaction();
      unsubBanned();
      unsubUnbanned();
      unsubDebug();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      setIsConnected(false);
    };
  }, [roomId]);

  const send = useCallback(
    async (
      content: string,
      type: 'text' | 'image' | 'gif' | 'voice' = 'text',
      imageUrl?: string,
      replyToId?: string
    ) => {
      if (!roomId || !isAuthenticated || !walletAddress) return;
      if (isBanned) {
        toast.error('You are banned from chat');
        return;
      }
      setIsSending(true);

      // Build reply_to data from the original message so sender_name is correct
      let replyToData: SupabaseLiveChatMessage['reply_to'];
      if (replyToId) {
        const original = messages.find((m) => m.id === replyToId);
        if (original) {
          replyToData = {
            id: original.id,
            content: original.content || 'Media',
            sender_name: original.sender_display_name || original.sender_username || original.sender_address?.slice(0, 6) || 'User',
          };
        }
      }

      const optimisticId = `temp-${Date.now()}`;
      const optimisticMsg: SupabaseLiveChatMessage = {
        id: optimisticId,
        room_id: roomId,
        sender_address: walletAddress.toLowerCase(),
        sender_username: user?.username || null,
        sender_display_name: user?.displayName || null,
        sender_avatar_url: user?.avatarImageUrl || null,
        content,
        message_type: type,
        image_url: imageUrl || null,
        is_pinned: false,
        created_at: new Date().toISOString(),
        reply_to: replyToData,
      };
      setMessages((prev) => {
        const next = [...prev, optimisticMsg];
        if (roomId) liveChatMessagesCache.set(roomId, next);
        return next;
      });

      try {
        const socket = getSocket();
        if (!socket.connected) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
            socket.once('connect', () => { clearTimeout(timeout); resolve(); });
            if (socket.connected) { clearTimeout(timeout); resolve(); }
          });
        }

        const apiType = type === 'image' || type === 'voice' ? 'media' : type;
        emitSendMessage({ roomId, content, messageType: apiType, imageUrl, replyTo: replyToId });

        setTimeout(() => { fetchMessages(false); }, 1500);
      } catch (err: any) {
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== optimisticId);
          if (roomId) liveChatMessagesCache.set(roomId, next);
          return next;
        });
        toast.error(`Failed to send: ${err?.message || 'Unknown error'}`);
        console.error('[LiveChat] Failed to send message:', err);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [roomId, isAuthenticated, walletAddress, user, isBanned, fetchMessages, messages]
  );

  const addReaction = useCallback((messageId: string, emoji: string) => {
    if (!isAuthenticated || !walletAddress) {
      toast.error('Sign in to react');
      return;
    }
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        const existing = reactions[emoji] || [];
        if (!existing.some((a) => a.toLowerCase() === walletAddress.toLowerCase())) {
          reactions[emoji] = [...existing, walletAddress.toLowerCase()];
        }
        return { ...m, reactions };
      })
    );
    emitAddReaction(messageId, emoji);
  }, [isAuthenticated, walletAddress]);

  const removeReaction = useCallback((messageId: string, emoji: string) => {
    if (!walletAddress) return;
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        reactions[emoji] = (reactions[emoji] || []).filter(
          (a) => a.toLowerCase() !== walletAddress.toLowerCase()
        );
        if (reactions[emoji].length === 0) delete reactions[emoji];
        return { ...m, reactions: Object.keys(reactions).length > 0 ? reactions : undefined };
      })
    );
    emitRemoveReaction(messageId, emoji);
  }, [walletAddress]);

  return {
    messages, isLoading, isSending, isConnected, isBanned,
    send, addReaction, removeReaction,
    refetch: () => fetchMessages(false),
  };
}

/**
 * Presence hook
 */
export function useLiveChatPresence(_roomId: string | null) {
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    if (!_roomId) return;
    getLiveChatOnlineCount().then(setOnlineCount).catch(() => {});
    const interval = setInterval(() => {
      getLiveChatOnlineCount().then(setOnlineCount).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [_roomId]);

  return {
    onlineUsers: [] as Array<{ address: string; username?: string; avatar?: string }>,
    onlineCount,
  };
}

export function useLiveChatRoomDetails(roomId: string | null) {
  const [room, setRoom] = useState<LiveChatRoom | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!roomId) { setRoom(null); return; }
    setIsLoading(true);
    try {
      const data = await getLiveChatRoom(roomId);
      setRoom(data);
    } catch (err) {
      console.error('[LiveChat] Failed to fetch room details:', err);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { room, isLoading, refetch: fetch };
}

export function useLiveChatUser(address: string | null) {
  const [profile, setProfile] = useState<LiveChatUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!address) { setProfile(null); return; }
    setIsLoading(true);
    try {
      const data = await getLiveChatUserProfile(address);
      setProfile(data);
    } catch (err) {
      console.error('[LiveChat] Failed to fetch user profile:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => { fetch(); }, [fetch]);

  return { profile, isLoading, refetch: fetch };
}
