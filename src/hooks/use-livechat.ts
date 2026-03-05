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
import { getSocket, joinRoom, leaveRoom, emitSendMessage, onLiveChatMessage, requestMessageHistory, debugSocketEvents } from '@/lib/api/dehub/socket';
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

/** Normalize socket message to our format (handles various server shapes) */
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
  };
}

/**
 * Livechat messages via Socket.IO (like mobile app).
 *
 * Flow:
 * 1. Initial load: REST GET for history (one-time)
 * 2. Real-time: socket joinRoom + onLiveChatMessage (no polling)
 * 3. Send: socket emitSendMessage
 * 4. Fallback: REST send if socket not connected
 */
export function useLiveChatMessages(roomId: string | null) {
  const [messages, setMessages] = useState<SupabaseLiveChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const { isAuthenticated, user, walletAddress } = useAuth();

  // Try REST first, then fall back to socket history
  const fetchMessages = useCallback(async (showLoading = false) => {
    if (!roomId) return;
    if (showLoading) setIsLoading(true);
    try {
      // Try REST API first
      const apiMessages = await fetchApiMessages(roomId, { limit: 200 });
      if (apiMessages.length > 0) {
        const mapped = apiMessages.map((m) => apiMsgToLocal(m, roomId));
        setMessages((prev) => {
          const optimistic = prev.filter((m) => m.id.startsWith('temp-'));
          return deduplicateMessages([...mapped, ...optimistic]);
        });
        setIsLoading(false);
        return;
      }
    } catch {
      // REST failed, try socket history
    }
    
    try {
      const socketMsgs = await requestMessageHistory(roomId, 200);
      if (socketMsgs.length > 0) {
        const mapped = socketMsgs
          .map((m) => socketMsgToLocal(m, roomId))
          .filter(Boolean) as SupabaseLiveChatMessage[];
        setMessages((prev) => {
          const optimistic = prev.filter((m) => m.id.startsWith('temp-'));
          return deduplicateMessages([...mapped, ...optimistic]);
        });
      }
    } catch (err) {
      console.error('[LiveChat] Socket history also failed:', err);
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

    // Enable debug logging to discover correct events
    const unsubDebug = debugSocketEvents();

    // 1. Initial load
    fetchMessages(true);

    // 2. Join room via socket
    joinRoom(roomId);
    const socket = getSocket();
    setIsConnected(socket.connected);
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', (err) => {
      toast.error(`Chat socket error: ${err.message}`);
    });
    const unsub = onLiveChatMessage((msg) => {
      const m = msg as Record<string, unknown>;
      const msgRoomId = (m.roomId ?? m.room_id ?? '') as string;
      if (msgRoomId && msgRoomId !== roomId) return;
      const local = socketMsgToLocal(msg, roomId);
      if (local) {
        setMessages((prev) => deduplicateMessages([...prev.filter((x) => x.id !== local.id), local]));
      }
    });

    return () => {
      leaveRoom(roomId);
      unsub();
      unsubDebug();
      setIsConnected(false);
    };
  }, [roomId, fetchMessages]);

  const send = useCallback(
    async (
      content: string,
      type: 'text' | 'image' | 'gif' | 'voice' = 'text',
      imageUrl?: string
    ) => {
      if (!roomId || !isAuthenticated || !walletAddress) return;
      setIsSending(true);

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
        const socket = getSocket();
        if (!socket.connected) {
          toast.info(`Socket not connected, waiting... (transport: ${(socket as any).io?.engine?.transport?.name || 'unknown'})`);
          // Wait briefly for connection
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
            socket.once('connect', () => { clearTimeout(timeout); resolve(); });
            if (socket.connected) { clearTimeout(timeout); resolve(); }
          });
        }
        toast.info(`Sending via socket (connected: ${socket.connected}, id: ${socket.id})`);
        emitSendMessage({ roomId, content, messageType: type, imageUrl });
        // Refresh messages after a delay to pick up the server-confirmed message
        setTimeout(() => fetchMessages(false), 2000);
      } catch (err: any) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        toast.error(`LiveChat send failed: ${err?.message || 'Unknown error'}`);
        console.error('[LiveChat] Failed to send message:', err);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [roomId, isAuthenticated, walletAddress, user, fetchMessages]
  );

  return { messages, isLoading, isSending, isConnected, send, refetch: () => fetchMessages(false) };
}

/**
 * Presence hook — fetches online count from /api/livechat/online
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
