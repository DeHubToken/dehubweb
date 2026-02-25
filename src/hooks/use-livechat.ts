import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getLiveChatRooms,
  getLiveChatRoom,
  getLiveChatMessages as fetchApiMessages,
  getLiveChatUserProfile,
  type LiveChatRoom,
  type LiveChatMessage,
  type LiveChatUserProfile,
} from '@/lib/api/dehub';
import {
  getSocket,
  joinRoom,
  leaveRoom,
  MSG_EVENTS,
  PRESENCE_EVENTS,
} from '@/lib/api/dehub/socket';
import { getAuthToken } from '@/lib/api/dehub/core';
import { useAuth } from '@/contexts/AuthContext';

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
}

export function useLiveChatRooms() {
  const [rooms, setRooms] = useState<LiveChatRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [fetchRooms]);

  return { rooms, isLoading, error, refetch: fetchRooms };
}

/** Convert a DeHub API message to our internal format */
function apiMsgToLocal(msg: LiveChatMessage, roomId?: string): SupabaseLiveChatMessage {
  return {
    id: msg.id,
    room_id: msg.roomId || roomId || '',
    sender_address: msg.sender?.address || '',
    sender_username: msg.sender?.username || null,
    sender_display_name: msg.sender?.displayName || null,
    sender_avatar_url: msg.sender?.avatarUrl || msg.sender?.avatarImageUrl || null,
    content: msg.content || '',
    message_type: msg.type || msg.messageType || 'text',
    image_url: msg.imageUrl || null,
    is_pinned: msg.isPinned || false,
    created_at: msg.createdAt,
  };
}

/** Try to normalize a raw socket message payload into LiveChatMessage shape */
function normalizeSocketMsg(raw: any, roomId: string): SupabaseLiveChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id || raw._id;
  if (!id) return null;

  const sender = raw.sender || {};
  return {
    id: String(id),
    room_id: raw.roomId || roomId,
    sender_address: sender.address || raw.senderAddress || '',
    sender_username: sender.username || raw.senderUsername || null,
    sender_display_name: sender.displayName || raw.senderDisplayName || null,
    sender_avatar_url: sender.avatarUrl || sender.avatarImageUrl || raw.senderAvatarUrl || null,
    content: raw.content || raw.text || '',
    message_type: raw.messageType || raw.type || 'text',
    image_url: raw.imageUrl || raw.image_url || null,
    is_pinned: raw.isPinned || false,
    created_at: raw.createdAt || raw.created_at || new Date().toISOString(),
  };
}

/** Deduplicate messages by id, keeping latest version */
function deduplicateMessages(msgs: SupabaseLiveChatMessage[]): SupabaseLiveChatMessage[] {
  const seen = new Map<string, SupabaseLiveChatMessage>();
  for (const m of msgs) {
    seen.set(m.id, m);
  }
  return Array.from(seen.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/**
 * Real-time livechat messages via DeHub Socket.io.
 *
 * Flow:
 * 1. Initial load: REST GET /api/livechat/rooms/{roomId}/messages
 * 2. Real-time: socket joinRoom → listen for message events
 * 3. Send: socket sendMessage event (optimistic update on UI)
 * 4. Cleanup: leaveRoom on unmount
 */
export function useLiveChatMessages(roomId: string | null) {
  const [messages, setMessages] = useState<SupabaseLiveChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const { isAuthenticated, user, walletAddress } = useAuth();

  // ── Initial REST load ──────────────────────────────────────────────────────
  const fetchFromApi = useCallback(async (showLoading = false) => {
    if (!roomId) return;
    if (showLoading) setIsLoading(true);
    try {
      const apiMessages = await fetchApiMessages(roomId, { limit: 200 });
      const mapped = apiMessages.map((m) => apiMsgToLocal(m, roomId));
      setMessages((prev) => {
        const optimistic = prev.filter((m) => m.id.startsWith('temp-'));
        return deduplicateMessages([...mapped, ...optimistic]);
      });
    } catch (err) {
      console.error('[LiveChat] Failed to fetch messages from API:', err);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  // ── Socket real-time subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    // 1. Load initial messages via REST
    fetchFromApi(true);

    // 2. Connect socket and join the room
    const s = getSocket();

    const onConnect = () => {
      setIsConnected(true);
      joinRoom(roomId);
      console.log('[LiveChat] Socket connected, joined room:', roomId);
    };

    const onDisconnect = () => {
      setIsConnected(false);
      console.log('[LiveChat] Socket disconnected');
    };

    // Handle incoming message events (try all possible event names)
    const handleNewMessage = (raw: any) => {
      console.log('[LiveChat] Incoming socket message:', raw);
      const msg = normalizeSocketMsg(raw, roomId);
      if (!msg) return;
      setMessages((prev) => {
        // Remove optimistic copy with same content from same sender if any
        const withoutOptimistic = prev.filter(
          (m) => !(m.id.startsWith('temp-') && m.content === msg.content && m.sender_address === msg.sender_address)
        );
        return deduplicateMessages([...withoutOptimistic, msg]);
      });
    };

    // Register all possible event names
    MSG_EVENTS.forEach((evt) => s.on(evt, handleNewMessage));

    if (s.connected) {
      onConnect();
    } else {
      s.once('connect', onConnect);
    }

    s.on('disconnect', onDisconnect);

    return () => {
      leaveRoom(roomId);
      MSG_EVENTS.forEach((evt) => s.off(evt, handleNewMessage));
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [roomId, fetchFromApi]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = useCallback(
    async (
      content: string,
      type: 'text' | 'image' | 'gif' | 'voice' = 'text',
      imageUrl?: string
    ) => {
      if (!roomId || !isAuthenticated || !walletAddress) return;
      setIsSending(true);

      // Optimistic message
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
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const s = getSocket();
        const token = getAuthToken();

        await new Promise<void>((resolve, reject) => {
          const payload: Record<string, unknown> = {
            roomId,
            content,
            messageType: type,
          };
          if (imageUrl) payload.imageUrl = imageUrl;
          if (token) payload.token = `Bearer ${token}`;

          s.emit('sendMessage', payload, (ack: any) => {
            console.log('[LiveChat] sendMessage ack:', ack);
            if (ack?.error) reject(new Error(ack.error));
            else resolve();
          });

          // Timeout if no ack
          setTimeout(() => resolve(), 3000);
        });

        // Refetch to confirm from server (socket event may also arrive)
        await fetchFromApi(false);
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        console.error('[LiveChat] Failed to send message:', err);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [roomId, isAuthenticated, walletAddress, user, fetchFromApi]
  );

  return { messages, isLoading, isSending, isConnected, send, refetch: () => fetchFromApi(false) };
}

/**
 * Track online users in a livechat room via DeHub socket presence events.
 * Falls back gracefully if the server doesn't emit presence events.
 */
export function useLiveChatPresence(roomId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<
    Array<{ address: string; username?: string; avatar?: string }>
  >([]);
  const { isAuthenticated, user, walletAddress } = useAuth();

  useEffect(() => {
    if (!roomId) {
      setOnlineUsers([]);
      return;
    }

    const s = getSocket();

    const handlePresence = (raw: any) => {
      console.log('[LiveChat] Presence update:', raw);

      // Server might send array of users or a map
      let users: Array<{ address: string; username?: string; avatar?: string }> = [];

      if (Array.isArray(raw)) {
        users = raw.map((u: any) => ({
          address: u.address || u.walletAddress || '',
          username: u.username || undefined,
          avatar: u.avatarUrl || u.avatar || undefined,
        }));
      } else if (raw?.users && Array.isArray(raw.users)) {
        users = raw.users.map((u: any) => ({
          address: u.address || '',
          username: u.username || undefined,
          avatar: u.avatarUrl || u.avatar || undefined,
        }));
      }

      setOnlineUsers(users);
    };

    PRESENCE_EVENTS.forEach((evt) => s.on(evt, handlePresence));

    // Announce our own presence when joining
    const announcePresence = () => {
      if (isAuthenticated && walletAddress) {
        s.emit('presence', {
          roomId,
          address: walletAddress.toLowerCase(),
          username: user?.username,
          avatar: user?.avatarImageUrl,
        });
      }
    };

    if (s.connected) {
      announcePresence();
    } else {
      s.once('connect', announcePresence);
    }

    return () => {
      PRESENCE_EVENTS.forEach((evt) => s.off(evt, handlePresence));
      s.off('connect', announcePresence);
    };
  }, [roomId, isAuthenticated, walletAddress, user?.username, user?.avatarImageUrl]);

  return {
    onlineUsers,
    onlineCount: onlineUsers.length,
  };
}

/**
 * Fetch full details for a single livechat room.
 */
export function useLiveChatRoomDetails(roomId: string | null) {
  const [room, setRoom] = useState<LiveChatRoom | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!roomId) {
      setRoom(null);
      return;
    }
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

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { room, isLoading, refetch: fetch };
}

/**
 * Fetch a livechat user's profile by wallet address.
 */
export function useLiveChatUser(address: string | null) {
  const [profile, setProfile] = useState<LiveChatUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!address) {
      setProfile(null);
      return;
    }
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

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { profile, isLoading, refetch: fetch };
}
