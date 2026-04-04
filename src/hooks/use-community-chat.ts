/**
 * Community Chat Hook
 * ====================
 * Custom Supabase-based chat for community pages.
 * Uses community_chat_messages table with realtime subscriptions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-helpers';
import { toast } from 'sonner';

export interface CommunityChatMessage {
  id: string;
  community_id: string;
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  content: string;
  message_type: string;
  image_url: string | null;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  // Joined reply data (resolved client-side)
  reply_to?: {
    id: string;
    content: string;
    sender_name: string;
  };
}

const QUERY_KEY = 'community-chat-messages';

export function useCommunityChat(communityId: string | undefined) {
  const { walletAddress, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch messages
  const { data: rawMessages = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, communityId],
    queryFn: async () => {
      if (!communityId) return [];
      const { data, error } = await supabase
        .from('community_chat_messages')
        .select('*')
        .eq('community_id', communityId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as CommunityChatMessage[];
    },
    enabled: !!communityId,
    staleTime: 30_000,
  });

  // Resolve reply_to data client-side
  const messages: CommunityChatMessage[] = rawMessages.map(msg => {
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

  // Realtime subscription
  useEffect(() => {
    if (!communityId) return;

    const channel = supabase
      .channel(`community-chat-${communityId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_chat_messages',
          filter: `community_id=eq.${communityId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            queryClient.setQueryData<CommunityChatMessage[]>(
              [QUERY_KEY, communityId],
              (old = []) => {
                // Dedupe
                if (old.some(m => m.id === (payload.new as CommunityChatMessage).id)) return old;
                return [...old, payload.new as CommunityChatMessage];
              }
            );
          } else if (payload.eventType === 'UPDATE') {
            queryClient.setQueryData<CommunityChatMessage[]>(
              [QUERY_KEY, communityId],
              (old = []) => old.map(m => m.id === (payload.new as CommunityChatMessage).id ? { ...m, ...payload.new as CommunityChatMessage } : m)
            );
          } else if (payload.eventType === 'DELETE') {
            queryClient.setQueryData<CommunityChatMessage[]>(
              [QUERY_KEY, communityId],
              (old = []) => old.filter(m => m.id !== (payload.old as any).id)
            );
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [communityId, queryClient]);

  // Send message
  const sendMessage = useCallback(async (
    content: string,
    messageType: string = 'text',
    imageUrl?: string,
    replyToId?: string,
    userProfile?: { username?: string; displayName?: string; avatarUrl?: string }
  ) => {
    if (!communityId || !walletAddress) return;

    const msg = {
      community_id: communityId,
      wallet_address: walletAddress.toLowerCase(),
      username: userProfile?.username || null,
      display_name: userProfile?.displayName || null,
      avatar_url: userProfile?.avatarUrl || null,
      content,
      message_type: messageType,
      image_url: imageUrl || null,
      reply_to_id: replyToId || null,
      reactions: {},
    };

    const { error } = await supabase
      .from('community_chat_messages')
      .insert(msg as any)
      .headers(withWalletHeader(walletAddress));

    if (error) {
      console.error('[CommunityChat] Send error:', error);
      toast.error('Failed to send message');
      throw error;
    }
  }, [communityId, walletAddress]);

  // Add reaction
  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!walletAddress || !communityId) return;
    const msg = rawMessages.find(m => m.id === messageId);
    if (!msg) return;

    const reactions = { ...(msg.reactions || {}) };
    const addresses = reactions[emoji] || [];
    if (addresses.some(a => a.toLowerCase() === walletAddress.toLowerCase())) return;
    reactions[emoji] = [...addresses, walletAddress.toLowerCase()];

    await supabase
      .from('community_chat_messages')
      .update({ reactions } as any)
      .eq('id', messageId)
      .headers(withWalletHeader(walletAddress));
  }, [rawMessages, walletAddress, communityId]);

  // Remove reaction
  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!walletAddress || !communityId) return;
    const msg = rawMessages.find(m => m.id === messageId);
    if (!msg) return;

    const reactions = { ...(msg.reactions || {}) };
    const addresses = reactions[emoji] || [];
    reactions[emoji] = addresses.filter(a => a.toLowerCase() !== walletAddress.toLowerCase());
    if (reactions[emoji].length === 0) delete reactions[emoji];

    await supabase
      .from('community_chat_messages')
      .update({ reactions } as any)
      .eq('id', messageId)
      .headers(withWalletHeader(walletAddress));
  }, [rawMessages, walletAddress, communityId]);

  return {
    messages,
    isLoading,
    sendMessage,
    addReaction,
    removeReaction,
  };
}
