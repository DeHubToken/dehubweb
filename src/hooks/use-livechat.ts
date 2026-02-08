import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getLiveChatRooms,
  getLiveChatRoom,
  getLiveChatMessages,
  getLiveChatUserProfile,
  sendLiveChatMessage,
  type LiveChatRoom,
  type LiveChatMessage,
  type LiveChatUserProfile,
  getMediaUrl,
} from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

const POLL_INTERVAL = 4000; // 4 seconds

export function useLiveChatRooms() {
  const [rooms, setRooms] = useState<LiveChatRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRooms = useCallback(() => {
    setIsLoading(true);
    getLiveChatRooms()
      .then((data) => setRooms(data))
      .catch((err) => console.error('[LiveChat] Failed to fetch rooms:', err))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  return { rooms, isLoading, refetch: fetchRooms };
}

export function useLiveChatMessages(roomId: string | null) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { isAuthenticated } = useAuth();

  const fetchMessages = useCallback(async (showLoading = false) => {
    if (!roomId) return;
    if (showLoading) setIsLoading(true);
    try {
      const data = await getLiveChatMessages(roomId, { limit: 50 });
      setMessages(data);
    } catch (err) {
      console.error('[LiveChat] Failed to fetch messages:', err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [roomId]);

  // Initial fetch + polling
  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    fetchMessages(true);

    pollRef.current = setInterval(() => fetchMessages(false), POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [roomId, fetchMessages]);

  const send = useCallback(async (
    content: string,
    type: 'text' | 'image' | 'gif' = 'text',
    imageUrl?: string,
  ) => {
    if (!roomId || !isAuthenticated) return;
    setIsSending(true);
    try {
      const newMsg = await sendLiveChatMessage(roomId, content, type, imageUrl);
      // Optimistic: append if not already in list
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    } catch (err) {
      console.error('[LiveChat] Failed to send message:', err);
      throw err;
    } finally {
      setIsSending(false);
    }
  }, [roomId, isAuthenticated]);

  return { messages, isLoading, isSending, send, refetch: () => fetchMessages(false) };
}

/**
 * Fetch full details for a single livechat room.
 * Provides richer metadata (description, messageCount, moderators) than the list endpoint.
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
 * Returns display name, avatar, banned/moderator status.
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
