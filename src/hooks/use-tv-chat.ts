/**
 * TV Chat Hook
 * ============
 * Realtime chat for a single live TV channel. Mirrors the event/community chat
 * pattern so every chat surface in the app shares one message shape.
 *
 * The socket.io livechat backend is not usable here: `/api/livechat/room` takes
 * no id and `getLiveChatMessages` ignores its roomId argument, so it is one
 * global room. Per-channel rooms ride Supabase instead.
 */

import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { toast } from 'sonner';

export interface TVChatMessage {
  id: string;
  channel_id: string;
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

const QUERY_KEY = 'tv-chat-messages';
const PAGE_LIMIT = 200;

export function useTVChat(channelId: string | undefined, enabled = true) {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const active = !!channelId && enabled;

  const { data: rawMessages = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, channelId],
    queryFn: async () => {
      if (!channelId) return [];
      // Newest N, then flipped back to reading order — a channel that has been
      // chatting for months should open on the current conversation, not on its
      // first 200 messages ever.
      const { data, error } = await supabase
        .from('tv_chat_messages' as any)
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(PAGE_LIMIT);
      if (error) throw error;
      return ((data || []) as unknown as TVChatMessage[]).slice().reverse();
    },
    enabled: active,
    staleTime: 30_000,
  });

  // Resolve reply_to
  const messages: TVChatMessage[] = rawMessages.map(msg => {
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

  // Realtime. Gated on `enabled` because /app/tv mounts every channel card at
  // once — subscribing unconditionally would open one channel per card.
  useEffect(() => {
    if (!active) return;
    const channel = supabase
      .channel(`tv-chat-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tv_chat_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            queryClient.setQueryData<TVChatMessage[]>(
              [QUERY_KEY, channelId],
              (old = []) => {
                if (old.some(m => m.id === (payload.new as TVChatMessage).id)) return old;
                return [...old, payload.new as TVChatMessage];
              }
            );
          } else if (payload.eventType === 'UPDATE') {
            queryClient.setQueryData<TVChatMessage[]>(
              [QUERY_KEY, channelId],
              (old = []) => old.map(m => m.id === (payload.new as TVChatMessage).id ? { ...m, ...payload.new as TVChatMessage } : m)
            );
          } else if (payload.eventType === 'DELETE') {
            queryClient.setQueryData<TVChatMessage[]>(
              [QUERY_KEY, channelId],
              (old = []) => old.filter(m => m.id !== (payload.old as any).id)
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [active, channelId, queryClient]);

  const sendMessage = useCallback(async (
    content: string,
    messageType: string = 'text',
    imageUrl?: string,
    replyToId?: string,
    userProfile?: { username?: string; displayName?: string; avatarUrl?: string; badgeBalance?: number }
  ) => {
    if (!channelId || !walletAddress) return;
    const msg = {
      channel_id: channelId,
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
      supabase.from('tv_chat_messages' as any).insert(msg as any),
      walletAddress
    );
    if (error) {
      console.error('[TVChat] Send error:', error);
      toast.error('Failed to send message');
      throw error;
    }
  }, [channelId, walletAddress]);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!walletAddress || !channelId) return;
    const msg = rawMessages.find(m => m.id === messageId);
    if (!msg) return;
    const reactions = { ...(msg.reactions || {}) };
    const addresses = reactions[emoji] || [];
    if (addresses.some(a => a.toLowerCase() === walletAddress.toLowerCase())) return;
    reactions[emoji] = [...addresses, walletAddress.toLowerCase()];

    queryClient.setQueryData<TVChatMessage[]>(
      [QUERY_KEY, channelId],
      (old = []) => old.map(m => m.id === messageId ? { ...m, reactions } : m)
    );

    await withWalletHeader(
      supabase.from('tv_chat_messages' as any).update({ reactions } as any).eq('id', messageId),
      walletAddress
    );
  }, [rawMessages, walletAddress, channelId, queryClient]);

  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!walletAddress || !channelId) return;
    const msg = rawMessages.find(m => m.id === messageId);
    if (!msg) return;
    const reactions = { ...(msg.reactions || {}) };
    const addresses = reactions[emoji] || [];
    reactions[emoji] = addresses.filter(a => a.toLowerCase() !== walletAddress.toLowerCase());
    if (reactions[emoji].length === 0) delete reactions[emoji];

    queryClient.setQueryData<TVChatMessage[]>(
      [QUERY_KEY, channelId],
      (old = []) => old.map(m => m.id === messageId ? { ...m, reactions } : m)
    );

    await withWalletHeader(
      supabase.from('tv_chat_messages' as any).update({ reactions } as any).eq('id', messageId),
      walletAddress
    );
  }, [rawMessages, walletAddress, channelId, queryClient]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!walletAddress || !channelId) return;
    const trimmed = newContent.trim();
    if (!trimmed) return;

    queryClient.setQueryData<TVChatMessage[]>(
      [QUERY_KEY, channelId],
      (old = []) => old.map(m => m.id === messageId ? { ...m, content: trimmed } : m)
    );

    const { error } = await withWalletHeader(
      supabase.from('tv_chat_messages' as any).update({ content: trimmed } as any).eq('id', messageId).eq('wallet_address', walletAddress.toLowerCase()),
      walletAddress
    );
    if (error) {
      console.error('[TVChat] Edit error:', error);
      toast.error('Failed to edit message');
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, channelId] });
    }
  }, [walletAddress, channelId, queryClient]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!walletAddress || !channelId) return;

    queryClient.setQueryData<TVChatMessage[]>(
      [QUERY_KEY, channelId],
      (old = []) => old.filter(m => m.id !== messageId)
    );

    const { error } = await withWalletHeader(
      supabase.from('tv_chat_messages' as any).delete().eq('id', messageId).eq('wallet_address', walletAddress.toLowerCase()),
      walletAddress
    );
    if (error) {
      console.error('[TVChat] Delete error:', error);
      toast.error('Failed to delete message');
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, channelId] });
    }
  }, [walletAddress, channelId, queryClient]);

  return { messages, isLoading, sendMessage, editMessage, deleteMessage, addReaction, removeReaction };
}
