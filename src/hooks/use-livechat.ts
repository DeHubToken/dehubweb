import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getLiveChatRooms,
  getLiveChatRoom,
  getLiveChatMessages as fetchApiMessages,
  getLiveChatUserProfile,
  sendLiveChatMessage,
  getMediaUrl,
  type LiveChatRoom,
  type LiveChatMessage,
  type LiveChatUserProfile,
} from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/** Shape of a row in the livechat_messages Supabase table */
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
function apiMsgToLocal(msg: LiveChatMessage): SupabaseLiveChatMessage {
  return {
    id: msg.id,
    room_id: msg.roomId,
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

/** Deduplicate messages by id, preferring API messages */
function deduplicateMessages(msgs: SupabaseLiveChatMessage[]): SupabaseLiveChatMessage[] {
  const seen = new Map<string, SupabaseLiveChatMessage>();
  for (const m of msgs) {
    if (!seen.has(m.id)) {
      seen.set(m.id, m);
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/**
 * Fetch messages from DeHub API as source of truth.
 * Polling every 5s catches messages from all clients (web + mobile).
 * Optimistic updates provide instant local feedback on send.
 */
export function useLiveChatMessages(roomId: string | null) {
  const [messages, setMessages] = useState<SupabaseLiveChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const { isAuthenticated, user, walletAddress } = useAuth();

  const fetchFromApi = useCallback(async (showLoading = false) => {
    if (!roomId) return;
    if (showLoading) setIsLoading(true);
    try {
      const apiMessages = await fetchApiMessages(roomId, { limit: 200 });
      const apiMapped = apiMessages.map(apiMsgToLocal);
      setMessages((prev) => {
        const optimistic = prev.filter((m) => m.id.startsWith('temp-'));
        const merged = deduplicateMessages([...apiMapped, ...optimistic]);
        if (merged.length > 0 || prev.length === 0) return merged;
        return prev;
      });
    } catch (err) {
      console.error('[LiveChat] Failed to fetch messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  // Initial fetch + poll every 5s for new messages (replaces Supabase Realtime)
  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    fetchFromApi(true);
    const interval = setInterval(() => fetchFromApi(false), 5000);
    return () => clearInterval(interval);
  }, [roomId, fetchFromApi]);

  // Send via DeHub API directly
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
        await sendLiveChatMessage(roomId, content, type as 'text' | 'image' | 'gif', imageUrl);
        // Refetch to replace optimistic message with real one from server
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

  return { messages, isLoading, isSending, send, refetch: () => fetchFromApi(false) };
}

/**
 * Supabase Presence for tracking online users in a livechat room.
 */
export function useLiveChatPresence(roomId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<
    Array<{ address: string; username?: string; avatar?: string }>
  >([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { isAuthenticated, user, walletAddress } = useAuth();

  useEffect(() => {
    if (!roomId) {
      setOnlineUsers([]);
      return;
    }

    const channel = supabase.channel(`presence:livechat:${roomId}`, {
      config: { presence: { key: walletAddress?.toLowerCase() || 'anon' } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: typeof onlineUsers = [];
        for (const key of Object.keys(state)) {
          const presences = state[key] as Array<Record<string, unknown>>;
          if (presences.length > 0) {
            const p = presences[0];
            users.push({
              address: (p.address as string) || key,
              username: p.username as string | undefined,
              avatar: p.avatar as string | undefined,
            });
          }
        }
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && isAuthenticated && walletAddress) {
          await channel.track({
            address: walletAddress.toLowerCase(),
            username: user?.username || undefined,
            avatar: user?.avatarImageUrl || undefined,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
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
