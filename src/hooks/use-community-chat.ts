import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Community Chat Hook
 * ====================
 * Custom Supabase-based chat for community pages.
 * Uses community_chat_messages table with realtime subscriptions.
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { getAccountSummaries } from '@/lib/api/dehub';
import { adminErrorMessage } from '@/hooks/use-community-admin';
import { translateCopy as _translateCopy } from '@/i18n/copy';
import { notifyCommunityMentions } from '@/lib/community-mention-notify';
import { toast } from 'sonner';
import { useCommunityChatHistory } from './use-community-chat-history';
import { updateCommunityChatCache, type CommunityChatHistory, type CommunityChatCursor, type CommunityChatPage } from '@/lib/community-chat-history';

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
  pinned_at: string | null;
  pinned_by: string | null;
  edited_at: string | null;
  reply_to?: {
    id: string;
    content: string;
    sender_name: string;
  };
}


async function readCommunityPage({ communityId, walletAddress, cursor, anchorId, signal }: {
  communityId: string; walletAddress: string | null; cursor: CommunityChatCursor | null;
  anchorId: string | null; signal: AbortSignal;
}): Promise<CommunityChatPage<CommunityChatMessage>> {
  const { data, error } = await withWalletHeader(
    (supabase as any).rpc('community_chat_page_v1', {
      _community_id: communityId, _before_at: cursor?.created_at ?? null,
      _before_id: cursor?.id ?? null, _anchor_id: anchorId, _limit: 50,
    }).abortSignal(signal), walletAddress,
  );
  if (error) throw error;
  return data as CommunityChatPage<CommunityChatMessage>;
}


export function useCommunityChat(
  communityId: string | undefined,
  options?: { isPrivate?: boolean },
) {
  const { t: _copy } = _useCopy();
  const { walletAddress, user } = useAuth();
  const queryClient = useQueryClient();
  const isPrivate = !!options?.isPrivate;
  const history = useCommunityChatHistory({
    communityId, walletAddress: walletAddress ?? null, isPrivate, readPage: readCommunityPage,
  });
  const { rawMessages, referenceMessages, messagesKey, isLoading } = history;

  // Latest profile fields for the current user — used to overlay onto their own
  // messages so display name / username / avatar updates reflect immediately
  // across the community chat without waiting for a refetch.
  const myAddress = walletAddress?.toLowerCase();
  const myDisplayName = (user as any)?.displayName ?? null;
  const myUsername = (user as any)?.username ?? null;
  const myAvatarUrl = (user as any)?.avatarImageUrl ?? (user as any)?.avatarUrl ?? null;

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

  const { data: senderProfiles = [] } = useQuery({
    queryKey: ['community-chat-sender-profiles', communityId, uniqueSenderAddresses.join(',')],
    queryFn: () => getAccountSummaries(uniqueSenderAddresses),
    enabled: uniqueSenderAddresses.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });

  const senderProfileMap = useMemo(() => {
    const map = new Map<string, { displayName: string | null; username: string | null; avatarUrl: string | null }>();
    for (const profile of senderProfiles) {
      map.set(profile.address.toLowerCase(), {
        displayName: profile.displayName ?? null,
        username: profile.username ?? null,
        avatarUrl: profile.avatarImageUrl ?? null,
      });
    }
    return map;
  }, [senderProfiles]);

  // Overlay latest profile onto each message: current user from useAuth, others
  // from the cached DeHub profile lookup. Messages store a snapshot at insert
  // time, so this keeps display name / username / avatar fresh after renames.
  // Memoized: this double map (plus reply resolution below) used to rebuild
  // message objects on every render — including each composer keystroke.
  const messages: CommunityChatMessage[] = useMemo(() => {
    const overlaid = rawMessages.map(msg => {
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

    // Resolve reply_to data client-side (using overlaid values for fresh
    // names) — via an id map instead of a find() per reply (was O(n²)).
    const byId = new Map([...referenceMessages, ...overlaid].map(m => [m.id, m]));
    return overlaid.map(msg => {
      if (!msg.reply_to_id) return msg;
      const parent = byId.get(msg.reply_to_id);
      if (!parent) return msg;
      return {
        ...msg,
        reply_to: {
          id: parent.id,
          content: parent.content || (parent.message_type === 'gif' ? 'GIF' : _translateCopy("copy.d357175cfe89", { defaultValue: "Media" })),
          sender_name: parent.display_name || parent.username || _translateCopy("copy.b512d97e7cbf", { defaultValue: "User" }),
        },
      };
    });
  }, [rawMessages, referenceMessages, senderProfileMap, myAddress, myDisplayName, myUsername, myAvatarUrl]);

  // Realtime subscription
  useEffect(() => {
    if (!communityId || isPrivate) return;

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
          const currentPin = queryClient.getQueryData<CommunityChatHistory<CommunityChatMessage>>(messagesKey)?.pages[0]?.pinned_message?.id;
          if ((payload.eventType === 'UPDATE' && (payload.new.pinned_at || payload.new.id === currentPin))
            || (payload.eventType === 'DELETE' && payload.old.id === currentPin)) {
            void queryClient.invalidateQueries({ queryKey: messagesKey });
          }
          if (payload.eventType === 'INSERT' && !history.isHistoryWindow) {
            updateCommunityChatCache<CommunityChatMessage>(queryClient,
              messagesKey,
              (old = []) => {
                if (old.some(m => m.id === (payload.new as CommunityChatMessage).id)) return old;
                return [...old, payload.new as CommunityChatMessage];
              }
            );
          } else if (payload.eventType === 'UPDATE') {
            updateCommunityChatCache<CommunityChatMessage>(queryClient,
              messagesKey,
              (old = []) => old.map(m => m.id === (payload.new as CommunityChatMessage).id ? { ...m, ...payload.new as CommunityChatMessage } : m)
            );
          } else if (payload.eventType === 'DELETE') {
            updateCommunityChatCache<CommunityChatMessage>(queryClient,
              messagesKey,
              (old = []) => old.filter(m => m.id !== (payload.old as any).id)
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') queryClient.invalidateQueries({ queryKey: messagesKey });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [communityId, isPrivate, history.isHistoryWindow, queryClient, messagesKey]);

  // Send message
  const sendMessage = useCallback(async (
    content: string,
    messageType: string = 'text',
    imageUrl?: string,
    replyToId?: string,
    userProfile?: { username?: string; displayName?: string; avatarUrl?: string; badgeBalance?: number }
  ) => {
    if (!communityId || !walletAddress) throw new Error(_translateCopy("copy.bc30560b2f21", { defaultValue: "Sign in to send a message" }));

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

    const { data: inserted, error } = await withWalletHeader(
      supabase
        .from('community_chat_messages')
        .insert(msg as any)
        .select('*')
        .single(),
      walletAddress
    );

    if (error) {
      console.error('[CommunityChat] Send error:', error);
      // Slow mode, mute and revoked send rights all land here as raised
      // conditions -- say which one rather than a generic failure.
      toast.error(adminErrorMessage(error, _translateCopy("copy.66b8e077d85f", { defaultValue: "Failed to send message" })));
      throw error;
    }

    if (inserted && !history.isHistoryWindow) {
      updateCommunityChatCache<CommunityChatMessage>(queryClient, messagesKey,
        old => old.some(row => row.id === (inserted as CommunityChatMessage).id)
          ? old : [...old, inserted as CommunityChatMessage]);
    }
    void queryClient.invalidateQueries({ queryKey: messagesKey });
    if (history.isHistoryWindow) void history.showLatest().catch(() => {});

    // Mentions are notified after the message is safely stored, and a failure
    // here never surfaces as a send failure: the message is already posted and
    // visible, so the worst case is a missing notification rather than a
    // message the sender believes was lost.
    const messageId = (inserted as { id?: string } | null)?.id;
    if (messageId) {
      void notifyCommunityMentions({
        communityId,
        messageId,
        content,
        walletAddress,
      });
    }
  }, [communityId, walletAddress, queryClient, messagesKey, history.isHistoryWindow, history.showLatest]);

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
    const prev = queryClient.getQueryData<CommunityChatHistory<CommunityChatMessage>>(messagesKey);
    updateCommunityChatCache<CommunityChatMessage>(queryClient,
      messagesKey,
      (old = []) => old.map(m => m.id === messageId ? { ...m, reactions } : m)
    );

    const { error } = await withWalletHeader(
      supabase
        .from('community_chat_messages')
        .update({ reactions } as any)
        .eq('id', messageId),
      walletAddress
    );

    if (error) {
      toast.error(adminErrorMessage(error, _translateCopy("copy.13931898084d", { defaultValue: "Failed to react" })));
      if (prev) queryClient.setQueryData(messagesKey, prev);
    }
  }, [rawMessages, walletAddress, communityId, queryClient, messagesKey]);

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
    const prev = queryClient.getQueryData<CommunityChatHistory<CommunityChatMessage>>(messagesKey);
    updateCommunityChatCache<CommunityChatMessage>(queryClient,
      messagesKey,
      (old = []) => old.map(m => m.id === messageId ? { ...m, reactions } : m)
    );

    const { error } = await withWalletHeader(
      supabase
        .from('community_chat_messages')
        .update({ reactions } as any)
        .eq('id', messageId),
      walletAddress
    );

    if (error) {
      toast.error(adminErrorMessage(error, _translateCopy("copy.bf206a215a1f", { defaultValue: "Failed to remove reaction" })));
      if (prev) queryClient.setQueryData(messagesKey, prev);
    }
  }, [rawMessages, walletAddress, communityId, queryClient, messagesKey]);

  // Edit message
  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!walletAddress || !communityId) return false;
    const trimmed = newContent.trim();
    if (!trimmed) return false;

    // Optimistic update
    updateCommunityChatCache<CommunityChatMessage>(queryClient,
      messagesKey,
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
      toast.error(_copy("copy.da8e926af644", { defaultValue: "Failed to edit message" }));
      queryClient.invalidateQueries({ queryKey: messagesKey });
      return false;
    }
    return true;
  }, [walletAddress, communityId, queryClient, messagesKey, _copy]);

  // Delete message (own message, or a moderator deleting anyone's). Goes through
  // the RPC so a refusal actually raises instead of matching zero rows.
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!walletAddress || !communityId) return;
    const prev = queryClient.getQueryData<CommunityChatHistory<CommunityChatMessage>>(messagesKey);
    updateCommunityChatCache<CommunityChatMessage>(queryClient,
      messagesKey,
      (old = []) => old.filter(m => m.id !== messageId)
    );
    const { error } = await withWalletHeader(
      (supabase as any).rpc('community_delete_message', { _message_id: messageId }),
      walletAddress
    );
    if (error) {
      console.error('[CommunityChat] Delete error:', error);
      toast.error(adminErrorMessage(error, _translateCopy("copy.5ce4aeba4357", { defaultValue: "Failed to delete message" })));
      if (prev) queryClient.setQueryData(messagesKey, prev);
    }
  }, [walletAddress, communityId, queryClient, messagesKey]);

  // Pin / unpin. Only ever reaches the server for someone holding pin_messages.
  const setPinned = useCallback(async (messageId: string, pinned: boolean) => {
    if (!walletAddress || !communityId) return;
    const { error } = await withWalletHeader(
      (supabase as any).rpc('community_pin_message', { _message_id: messageId, _pinned: pinned }),
      walletAddress
    );
    if (error) {
      toast.error(adminErrorMessage(error, pinned ? _translateCopy("copy.675c5fe95089", { defaultValue: "Failed to pin message" }) : _translateCopy("copy.3b69de078742", { defaultValue: "Failed to unpin message" })));
      return;
    }
    updateCommunityChatCache<CommunityChatMessage>(queryClient,
      messagesKey,
      (old = []) => old.map(m => m.id === messageId
        ? { ...m, pinned_at: pinned ? new Date().toISOString() : null, pinned_by: pinned ? walletAddress.toLowerCase() : null }
        : m),
    );
    void queryClient.invalidateQueries({ queryKey: messagesKey });
    toast.success(pinned ? _translateCopy("copy.480e61cdab71", { defaultValue: "Message pinned" }) : _translateCopy("copy.dc1e29e33dc7", { defaultValue: "Message unpinned" }));
  }, [walletAddress, communityId, queryClient, messagesKey]);

  // Newest pin wins, matching the single-pin banner the chat renders.
  const pinnedMessage = useMemo(
    () => [...messages, ...(history.pinned ? [history.pinned] : [])].filter(m => m.pinned_at).sort((a, b) => (b.pinned_at ?? '').localeCompare(a.pinned_at ?? ''))[0] ?? null,
    [messages, history.pinned],
  );

  return {
    ...history,
    messages,
    pinnedMessage,
    isLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    setPinned,
    addReaction,
    removeReaction,
  };
}
