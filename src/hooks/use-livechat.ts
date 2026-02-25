import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLiveChatRooms,
  getLiveChatRoom,
  getLiveChatMessages as fetchApiMessages,
  sendLiveChatMessage,
  getLiveChatUserProfile,
  type LiveChatRoom,
  type LiveChatMessage,
  type LiveChatUserProfile,
} from '@/lib/api/dehub';
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

const POLL_INTERVAL_MS = 5000;

/**
 * Livechat messages via DeHub REST API with 5-second polling.
 *
 * Flow:
 * 1. Initial load: REST GET /api/livechat/rooms/{roomId}/messages
 * 2. Real-time: poll every 5s for new messages
 * 3. Send: REST POST via sendLiveChatMessage edge function
 * 4. Cleanup: clear interval on unmount
 */
export function useLiveChatMessages(roomId: string | null) {
  const [messages, setMessages] = useState<SupabaseLiveChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const { isAuthenticated, user, walletAddress } = useAuth();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    // 1. Initial load
    fetchFromApi(true);

    // 2. Poll every 5s
    pollingRef.current = setInterval(() => fetchFromApi(false), POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [roomId, fetchFromApi]);

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
        await sendLiveChatMessage(roomId, content, type, imageUrl);
        // Refetch to get server-confirmed message
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

  return { messages, isLoading, isSending, isConnected: true, send, refetch: () => fetchFromApi(false) };
}

/**
 * Placeholder presence hook — returns empty list.
 * Real presence would require socket or a dedicated API endpoint.
 */
export function useLiveChatPresence(_roomId: string | null) {
  return {
    onlineUsers: [] as Array<{ address: string; username?: string; avatar?: string }>,
    onlineCount: 0,
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
