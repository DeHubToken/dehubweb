import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getLiveChatRooms,
  getLiveChatMessages,
  sendLiveChatMessage,
  type LiveChatRoom,
  type LiveChatMessage,
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
