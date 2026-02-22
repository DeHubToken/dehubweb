import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getLiveChatRooms,
  getLiveChatRoom,
  getLiveChatMessages as fetchApiMessages,
  getLiveChatUserProfile,
  getMediaUrl,
  getAuthToken,
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
 * Supabase Realtime provides instant delivery for our own users.
 * Periodic polling catches messages from other clients (mobile app).
 */
export function useLiveChatMessages(roomId: string | null) {
  const [messages, setMessages] = useState<SupabaseLiveChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { isAuthenticated, user, walletAddress } = useAuth();

  // Fetch from DeHub API only — Supabase Realtime handles our own messages
  // This eliminates redundant Supabase REST polling that was causing 504 timeouts
  const fetchFromApi = useCallback(async (showLoading = false) => {
    if (!roomId) return;
    if (showLoading) setIsLoading(true);
    try {
      const apiMessages = await fetchApiMessages(roomId, { limit: 200 });
      const apiMapped = apiMessages.map(apiMsgToLocal);

      setMessages((prev) => {
        // Keep optimistic messages and any Supabase-realtime-delivered messages not in API yet
        const optimistic = prev.filter((m) => m.id.startsWith('temp-'));
        const realtimeOnly = prev.filter(
          (m) => !m.id.startsWith('temp-') && !apiMapped.some((a) => a.id === m.id)
        );
        return deduplicateMessages([...apiMapped, ...realtimeOnly, ...optimistic]);
      });
    } catch (err) {
      console.error('[LiveChat] Failed to fetch messages:', err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [roomId]);

  // Subscribe to Realtime + set up polling
  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    fetchFromApi(true);

    // Supabase Realtime for instant delivery of our own messages
    const channel = supabase
      .channel(`livechat:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'livechat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMsg = payload.new as SupabaseLiveChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'livechat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const updated = payload.new as SupabaseLiveChatMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .subscribe();

    channelRef.current = channel;

    // No polling — Realtime handles incoming messages.
    // fetchFromApi is called on mount and after sending a message.

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [roomId, fetchFromApi]);

  // Send via Edge Function
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
        const token = getAuthToken();
        const { data, error } = await supabase.functions.invoke('livechat-send', {
          body: {
            room_id: roomId,
            content,
            message_type: type,
            image_url: imageUrl,
            sender_username: user?.username,
            sender_display_name: user?.displayName,
            sender_avatar_url: user?.avatarImageUrl,
          },
          headers: {
            'x-wallet-address': walletAddress.toLowerCase(),
            'x-dehub-token': token || '',
          },
        });

        if (error) {
          console.error('[LiveChat] Edge function error:', error);
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          throw new Error('Failed to send message');
        }

        const realMsg = data?.result as SupabaseLiveChatMessage | undefined;
        if (realMsg) {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticId ? realMsg : m))
          );
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        console.error('[LiveChat] Failed to send message:', err);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [roomId, isAuthenticated, walletAddress, user]
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
