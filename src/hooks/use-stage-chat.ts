/**
 * Stage Chat Hook
 * ===============
 * Realtime chat for one Stage (audio space). Twin of use-tv-chat / use-event-chat
 * so every chat surface in the app shares one message shape.
 *
 * Rides Supabase rather than the socket.io `/livechat` gateway for the reason
 * TV chat does: that gateway hard-codes GLOBAL_ROOM_ID and discards the roomId
 * every client sends, so "chat in this stage" would have been chat on the
 * whole platform.
 *
 * Rows outlive the stage on purpose — a room's messages are the only thing
 * left to read once the audio has ended, so the same hook backs both the live
 * chat and the comments under a recording.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import type { RealtimeChatMessage } from '@/components/app/chat/RealtimeChatPanel';
import { toast } from 'sonner';

export interface StageChatMessage extends RealtimeChatMessage {
  space_id: string;
}

const QUERY_KEY = 'stage-chat-messages';
const PAGE_LIMIT = 200;
const TABLE = 'stage_chat_messages';

interface StageChatData {
  messages: StageChatMessage[];
  unavailable: boolean;
}

/**
 * PostgREST's answer when the table is not there. The migration for this
 * feature has to be run by hand in the Lovable SQL editor, and the last time a
 * stage feature shipped ahead of its DDL it presented as two unrelated UI bugs
 * that cost half a day — so this one says so instead of rendering an eternally
 * empty room.
 */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /schema cache|does not exist/i.test(error.message || '')
  );
}

export function useStageChat(
  spaceId: string | undefined,
  options: { enabled?: boolean; hostWallet?: string | null } = {},
) {
  const { enabled = true, hostWallet } = options;
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const active = !!spaceId && enabled;

  const isHost =
    !!walletAddress && !!hostWallet && walletAddress.toLowerCase() === hostWallet.toLowerCase();

  const { data, isLoading } = useQuery<StageChatData>({
    queryKey: [QUERY_KEY, spaceId],
    queryFn: async () => {
      if (!spaceId) return { messages: [], unavailable: false };
      // Newest N, then flipped back into reading order — a long stage should
      // open on the current conversation, not on its first 200 messages.
      const { data, error } = await supabase
        .from(TABLE as never)
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(PAGE_LIMIT);
      if (error) {
        if (isMissingTable(error)) {
          console.error(
            '[StageChat] stage_chat_messages is missing — run supabase/migrations/20260820120000_stage_chat_messages.sql',
          );
          return { messages: [], unavailable: true };
        }
        throw error;
      }
      return {
        messages: ((data || []) as unknown as StageChatMessage[]).slice().reverse(),
        unavailable: false,
      };
    },
    enabled: active,
    staleTime: 30_000,
  });

  const rawMessages = useMemo(() => data?.messages ?? [], [data]);
  const unavailable = data?.unavailable ?? false;

  // Resolve reply_to against what is loaded. A reply to something older than
  // the window renders as a plain message rather than a dangling quote.
  const messages: StageChatMessage[] = useMemo(
    () =>
      rawMessages.map((msg) => {
        if (!msg.reply_to_id) return msg;
        const parent = rawMessages.find((m) => m.id === msg.reply_to_id);
        if (!parent) return msg;
        return {
          ...msg,
          reply_to: {
            id: parent.id,
            content: parent.content || 'Media',
            sender_name: parent.display_name || parent.username || 'User',
          },
        };
      }),
    [rawMessages],
  );

  const patch = useCallback(
    (fn: (messages: StageChatMessage[]) => StageChatMessage[]) => {
      queryClient.setQueryData<StageChatData>([QUERY_KEY, spaceId], (old) =>
        old ? { ...old, messages: fn(old.messages) } : old,
      );
    },
    [queryClient, spaceId],
  );

  // Realtime. Gated on `enabled` so the collapsed comment panels on the
  // Recorded tab do not each hold a subscription open for the whole session.
  useEffect(() => {
    if (!active || unavailable) return;
    const channel = supabase
      .channel(`stage-chat-${spaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE,
          filter: `space_id=eq.${spaceId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as StageChatMessage;
            patch((old) => (old.some((m) => m.id === row.id) ? old : [...old, row]));
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as StageChatMessage;
            patch((old) => old.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
          } else if (payload.eventType === 'DELETE') {
            const gone = payload.old as { id?: string };
            patch((old) => old.filter((m) => m.id !== gone.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active, unavailable, spaceId, patch]);

  const sendMessage = useCallback(
    async (
      content: string,
      replyToId?: string,
      userProfile?: {
        username?: string;
        displayName?: string;
        avatarUrl?: string;
        badgeBalance?: number;
      },
    ) => {
      if (!spaceId || !walletAddress) return;
      const row = {
        space_id: spaceId,
        wallet_address: walletAddress.toLowerCase(),
        username: userProfile?.username || null,
        display_name: userProfile?.displayName || null,
        avatar_url: userProfile?.avatarUrl || null,
        badge_balance: userProfile?.badgeBalance ?? null,
        content,
        message_type: 'text',
        image_url: null,
        reply_to_id: replyToId || null,
        reactions: {},
      };

      const { error } = await withWalletHeader(
        supabase.from(TABLE as never).insert(row as never),
        walletAddress,
      );
      if (error) {
        console.error('[StageChat] Send error:', error);
        toast.error(
          isMissingTable(error) ? 'Stage chat is not set up yet' : 'Failed to send message',
        );
        throw error;
      }
    },
    [spaceId, walletAddress],
  );

  const writeReactions = useCallback(
    async (messageId: string, reactions: Record<string, string[]>) => {
      if (!walletAddress) return;
      patch((old) => old.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
      await withWalletHeader(
        supabase.from(TABLE as never).update({ reactions } as never).eq('id', messageId),
        walletAddress,
      );
    },
    [walletAddress, patch],
  );

  const addReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!walletAddress) return;
      const msg = rawMessages.find((m) => m.id === messageId);
      if (!msg) return;
      const reactions = { ...(msg.reactions || {}) };
      const addresses = reactions[emoji] || [];
      if (addresses.some((a) => a.toLowerCase() === walletAddress.toLowerCase())) return;
      reactions[emoji] = [...addresses, walletAddress.toLowerCase()];
      void writeReactions(messageId, reactions);
    },
    [rawMessages, walletAddress, writeReactions],
  );

  const removeReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!walletAddress) return;
      const msg = rawMessages.find((m) => m.id === messageId);
      if (!msg) return;
      const reactions = { ...(msg.reactions || {}) };
      reactions[emoji] = (reactions[emoji] || []).filter(
        (a) => a.toLowerCase() !== walletAddress.toLowerCase(),
      );
      if (reactions[emoji].length === 0) delete reactions[emoji];
      void writeReactions(messageId, reactions);
    },
    [rawMessages, walletAddress, writeReactions],
  );

  const editMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (!walletAddress || !spaceId) return;
      const trimmed = newContent.trim();
      if (!trimmed) return;

      patch((old) => old.map((m) => (m.id === messageId ? { ...m, content: trimmed } : m)));

      void (async () => {
        const { error } = await withWalletHeader(
          supabase
            .from(TABLE as never)
            .update({ content: trimmed } as never)
            .eq('id', messageId)
            .eq('wallet_address', walletAddress.toLowerCase()),
          walletAddress,
        );
        if (error) {
          console.error('[StageChat] Edit error:', error);
          toast.error('Failed to edit message');
          void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, spaceId] });
        }
      })();
    },
    [walletAddress, spaceId, patch, queryClient],
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      if (!walletAddress || !spaceId) return;

      patch((old) => old.filter((m) => m.id !== messageId));

      void (async () => {
        // The host can clear anything said in their room; everyone else is
        // scoped to their own rows, so a delete that the policy would refuse
        // never leaves the client believing it worked.
        const base = supabase.from(TABLE as never).delete().eq('id', messageId);
        const query = isHost
          ? base.eq('space_id', spaceId)
          : base.eq('wallet_address', walletAddress.toLowerCase());

        const { error } = await withWalletHeader(query, walletAddress);
        if (error) {
          console.error('[StageChat] Delete error:', error);
          toast.error('Failed to delete message');
          void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, spaceId] });
        }
      })();
    },
    [walletAddress, spaceId, isHost, patch, queryClient],
  );

  return {
    messages,
    isLoading: isLoading && !unavailable,
    unavailable,
    isHost,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
  };
}
