/**
 * Community Chat Hook
 * ====================
 * Custom Supabase-based chat for community pages.
 * Uses community_chat_messages table with realtime subscriptions.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { getAccountInfo } from '@/lib/api/dehub';
import { toast } from 'sonner';

export interface CommunityChatMessage {
  id: string;
  community_id: string;
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

const QUERY_KEY = 'community-chat-messages';

export function useCommunityChat(communityId: string | undefined) {
  const { walletAddress, user } = useAuth();
  const queryClient = useQueryClient();

  // Latest profile fields for the current user — used to overlay onto their own
  // messages so display name / username / avatar updates reflect immediately
  // across the community chat without waiting for a refetch.
  const myAddress = walletAddress?.toLowerCase();
  const myDisplayName = (user as any)?.displayName ?? null;
  const myUsername = (user as any)?.username ?? null;
  const myAvatarUrl = (user as any)?.avatarImageUrl ?? (user as any)?.avatarUrl ?? null;

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

  // Collect unique sender wallet addresses (excluding the current user — we
  // already have their fresh profile from useAuth) so we can fetch each one's
  // latest profile from the DeHub API. Cached for 5 minutes per address.
  const uniqueSenderAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const msg of rawMessages) {
      const addr = msg.wallet_address?.toLowerCase();
      if (addr && addr !== myAddress) set.add(addr);
    }
    return Array.from(set);
  }, [rawMessages, myAddress]);

  const profileQueries = useQueries({
    queries: uniqueSenderAddresses.map(addr => ({
      queryKey: ['community-chat-sender-profile', addr],
      queryFn: async () => {
        try {
          const info = await getAccountInfo(addr, addr);
          return {
            address: addr,
            displayName: (info as any)?.displayName ?? (info as any)?.display_name ?? null,
            username: (info as any)?.username ?? null,
            avatarUrl:
              (info as any)?.avatarImageUrl ??
              (info as any)?.avatarUrl ??
              (info as any)?.avatar_url ??
              null,
          };
        } catch {
          return { address: addr, displayName: null, username: null, avatarUrl: null };
        }
      },
      // Sender profiles rarely change — long cache windows keep repeat
      // community visits from refiring the whole per-sender fan-out.
      staleTime: 30 * 60_000,
      gcTime: 60 * 60_000,
      retry: 1,
    })),
  });

  const senderProfileMap = useMemo(() => {
    const map = new Map<string, { displayName: string | null; username: string | null; avatarUrl: string | null }>();
    for (const q of profileQueries) {
      const d = q.data as any;
      if (d?.address) {
        map.set(d.address, {
          displayName: d.displayName,
          username: d.username,
          avatarUrl: d.avatarUrl,
        });
      }
    }
    return map;
  }, [profileQueries]);

  // Overlay latest profile onto each message: current user from useAuth, others
  // from the cached DeHub profile lookup. Messages store a snapshot at insert
  // time, so this keeps display name / username / avatar fresh after renames.
  const overlaidMessages: CommunityChatMessage[] = rawMessages.map(msg => {
    const addr = msg.wallet_address?.toLowerCase();
    if (myAddress && addr === myAddress) {
      return {
        ...msg,
        display_name: myDisplayName ?? msg.display_name,
        username: myUsername ?? msg.username,
        avatar_url: myAvatarUrl ?? msg.avatar_url,
      };
    }
    if (addr) {
      const fresh = senderProfileMap.get(addr);
      if (fresh) {
        return {
          ...msg,
          display_name: fresh.displayName ?? msg.display_name,
          username: fresh.username ?? msg.username,
          avatar_url: fresh.avatarUrl ?? msg.avatar_url,
        };
      }
    }
    return msg;
  });

  // Resolve reply_to data client-side (using overlaid values for fresh names)
  const messages: CommunityChatMessage[] = overlaidMessages.map(msg => {
    if (!msg.reply_to_id) return msg;
    const parent = overlaidMessages.find(m => m.id === msg.reply_to_id);
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
    userProfile?: { username?: string; displayName?: string; avatarUrl?: string; badgeBalance?: number }
  ) => {
    if (!communityId || !walletAddress) return;

    const msg = {
      community_id: communityId,
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
      supabase
        .from('community_chat_messages')
        .insert(msg as any),
      walletAddress
    );

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

    // Optimistic update
    queryClient.setQueryData<CommunityChatMessage[]>(
      [QUERY_KEY, communityId],
      (old = []) => old.map(m => m.id === messageId ? { ...m, reactions } : m)
    );

    await withWalletHeader(
      supabase
        .from('community_chat_messages')
        .update({ reactions } as any)
        .eq('id', messageId),
      walletAddress
    );
  }, [rawMessages, walletAddress, communityId, queryClient]);

  // Remove reaction
  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!walletAddress || !communityId) return;
    const msg = rawMessages.find(m => m.id === messageId);
    if (!msg) return;

    const reactions = { ...(msg.reactions || {}) };
    const addresses = reactions[emoji] || [];
    reactions[emoji] = addresses.filter(a => a.toLowerCase() !== walletAddress.toLowerCase());
    if (reactions[emoji].length === 0) delete reactions[emoji];

    // Optimistic update
    queryClient.setQueryData<CommunityChatMessage[]>(
      [QUERY_KEY, communityId],
      (old = []) => old.map(m => m.id === messageId ? { ...m, reactions } : m)
    );

    await withWalletHeader(
      supabase
        .from('community_chat_messages')
        .update({ reactions } as any)
        .eq('id', messageId),
      walletAddress
    );
  }, [rawMessages, walletAddress, communityId, queryClient]);

  // Edit message
  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!walletAddress || !communityId) return;
    const trimmed = newContent.trim();
    if (!trimmed) return;

    // Optimistic update
    queryClient.setQueryData<CommunityChatMessage[]>(
      [QUERY_KEY, communityId],
      (old = []) => old.map(m => m.id === messageId ? { ...m, content: trimmed } : m)
    );

    const { error } = await withWalletHeader(
      supabase
        .from('community_chat_messages')
        .update({ content: trimmed } as any)
        .eq('id', messageId)
        .eq('wallet_address', walletAddress.toLowerCase()),
      walletAddress
    );

    if (error) {
      console.error('[CommunityChat] Edit error:', error);
      toast.error('Failed to edit message');
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, communityId] });
    }
  }, [walletAddress, communityId, queryClient]);

  // Delete message (own message, or moderator deleting any message)
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!walletAddress || !communityId) return;
    const prev = queryClient.getQueryData<CommunityChatMessage[]>([QUERY_KEY, communityId]);
    queryClient.setQueryData<CommunityChatMessage[]>(
      [QUERY_KEY, communityId],
      (old = []) => old.filter(m => m.id !== messageId)
    );
    const { error } = await withWalletHeader(
      supabase.from('community_chat_messages').delete().eq('id', messageId),
      walletAddress
    );
    if (error) {
      console.error('[CommunityChat] Delete error:', error);
      toast.error('Failed to delete message');
      if (prev) queryClient.setQueryData([QUERY_KEY, communityId], prev);
    }
  }, [walletAddress, communityId, queryClient]);

  return {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
  };
}
