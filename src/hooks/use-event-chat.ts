/**
 * Event Chat Hook
 * ================
 * Realtime chat for event pages. Mirrors community chat pattern.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { toast } from 'sonner';
import { useEffect } from 'react';

export interface EventChatMessage {
  id: string;
  event_id: string;
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  badge_balance: number | null;
  content: string;
  message_type: string;
  image_url: string | null;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  reply_to?: {
    id: string;
    content: string;
    sender_name: string;
  };
}

const QUERY_KEY = 'event-chat-messages';

export function useEventChat(eventId: string | undefined) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const { data: rawMessages = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('event_chat_messages' as any)
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as EventChatMessage[];
    },
    enabled: !!eventId,
    staleTime: 30_000,
  });

  // Resolve reply_to
  const messages: EventChatMessage[] = rawMessages.map(msg => {
    if (!msg.reply_to_id) return msg;
    const parent = rawMessages.find(m => m.id === msg.reply_to_id);
    if (!parent) return msg;
    return {
      ...msg,
      reply_to: {
        id: parent.id,
        content: parent.content || (parent.message_type === 'gif' ? 'GIF' : 'Media'),
        sender_name: parent.display_name || parent.username || 'User',
      },
    };
  });

  // Realtime
  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`event-chat-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_chat_messages',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            queryClient.setQueryData<EventChatMessage[]>(
              [QUERY_KEY, eventId],
              (old = []) => {
                if (old.some(m => m.id === (payload.new as EventChatMessage).id)) return old;
                return [...old, payload.new as EventChatMessage];
              }
            );
          } else if (payload.eventType === 'UPDATE') {
            queryClient.setQueryData<EventChatMessage[]>(
              [QUERY_KEY, eventId],
              (old = []) => old.map(m => m.id === (payload.new as EventChatMessage).id ? { ...m, ...payload.new as EventChatMessage } : m)
            );
          } else if (payload.eventType === 'DELETE') {
            queryClient.setQueryData<EventChatMessage[]>(
              [QUERY_KEY, eventId],
              (old = []) => old.filter(m => m.id !== (payload.old as any).id)
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [eventId, queryClient]);

  const sendMessage = useCallback(async (
    content: string,
    messageType: string = 'text',
    imageUrl?: string,
    replyToId?: string,
    userProfile?: { username?: string; displayName?: string; avatarUrl?: string; badgeBalance?: number }
  ) => {
    if (!eventId || !walletAddress) return;
    const msg = {
      event_id: eventId,
      wallet_address: walletAddress.toLowerCase(),
      username: userProfile?.username || null,
      display_name: userProfile?.displayName || null,
      avatar_url: userProfile?.avatarUrl || null,
      badge_balance: userProfile?.badgeBalance || null,
      content,
      message_type: messageType,
      image_url: imageUrl || null,
      reply_to_id: replyToId || null,
      reactions: {},
    };

    const { error } = await withWalletHeader(
      supabase.from('event_chat_messages' as any).insert(msg as any),
      walletAddress
    );
    if (error) {
      console.error('[EventChat] Send error:', error);
      toast.error('Failed to send message');
      throw error;
    }
  }, [eventId, walletAddress]);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!walletAddress || !eventId) return;
    const msg = rawMessages.find(m => m.id === messageId);
    if (!msg) return;
    const reactions = { ...(msg.reactions || {}) };
    const addresses = reactions[emoji] || [];
    if (addresses.some(a => a.toLowerCase() === walletAddress.toLowerCase())) return;
    reactions[emoji] = [...addresses, walletAddress.toLowerCase()];

    queryClient.setQueryData<EventChatMessage[]>(
      [QUERY_KEY, eventId],
      (old = []) => old.map(m => m.id === messageId ? { ...m, reactions } : m)
    );

    await withWalletHeader(
      supabase.from('event_chat_messages' as any).update({ reactions } as any).eq('id', messageId),
      walletAddress
    );
  }, [rawMessages, walletAddress, eventId, queryClient]);

  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!walletAddress || !eventId) return;
    const msg = rawMessages.find(m => m.id === messageId);
    if (!msg) return;
    const reactions = { ...(msg.reactions || {}) };
    const addresses = reactions[emoji] || [];
    reactions[emoji] = addresses.filter(a => a.toLowerCase() !== walletAddress.toLowerCase());
    if (reactions[emoji].length === 0) delete reactions[emoji];

    queryClient.setQueryData<EventChatMessage[]>(
      [QUERY_KEY, eventId],
      (old = []) => old.map(m => m.id === messageId ? { ...m, reactions } : m)
    );

    await withWalletHeader(
      supabase.from('event_chat_messages' as any).update({ reactions } as any).eq('id', messageId),
      walletAddress
    );
  }, [rawMessages, walletAddress, eventId, queryClient]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!walletAddress || !eventId) return;
    const trimmed = newContent.trim();
    if (!trimmed) return;

    queryClient.setQueryData<EventChatMessage[]>(
      [QUERY_KEY, eventId],
      (old = []) => old.map(m => m.id === messageId ? { ...m, content: trimmed } : m)
    );

    const { error } = await withWalletHeader(
      supabase.from('event_chat_messages' as any).update({ content: trimmed } as any).eq('id', messageId).eq('wallet_address', walletAddress.toLowerCase()),
      walletAddress
    );
    if (error) {
      console.error('[EventChat] Edit error:', error);
      toast.error('Failed to edit message');
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, eventId] });
    }
  }, [walletAddress, eventId, queryClient]);

  return { messages, isLoading, sendMessage, editMessage, addReaction, removeReaction };
}
