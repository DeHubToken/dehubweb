import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { getChatPrefs, setChatPref, type ChatPref, type ChatPrefPatch } from '@/lib/api/dehub/chat-prefs';
import { deleteConversation as clearConversationMessages } from '@/lib/api/dehub/dm';
import { messagesKeys } from '@/hooks/use-messages';
import type { DeHubConversation } from '@/lib/api/dehub';

const KEY = ['dm-chat-prefs'] as const;
const FOREVER = '2999-12-31T00:00:00.000Z';

function applyPatch(prev: ChatPref | undefined, id: string, patch: ChatPrefPatch): ChatPref {
  const now = new Date().toISOString();
  const next: ChatPref = prev ?? { conversationId: id, pinnedAt: null, archivedAt: null, mutedUntil: null, markedUnread: false };
  return {
    ...next,
    ...(patch.pinned !== undefined ? { pinnedAt: patch.pinned ? now : null } : {}),
    ...(patch.archived !== undefined ? { archivedAt: patch.archived ? now : null, ...(patch.archived ? { pinnedAt: null } : {}) } : {}),
    ...(patch.unread !== undefined ? { markedUnread: patch.unread } : {}),
    ...(patch.mutedUntil !== undefined ? { mutedUntil: patch.mutedUntil === 'forever' ? FOREVER : patch.mutedUntil } : {}),
  };
}

/**
 * Your own pins, archives, mutes and "marked unread" flags, saved on the
 * server so they follow you between devices. Changes show at once and roll
 * back if the save fails.
 */
export function useChatPrefs() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: getChatPrefs,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const byId = useMemo(() => {
    const map = new Map<string, ChatPref>();
    for (const p of data ?? []) map.set(p.conversationId, p);
    return map;
  }, [data]);

  const update = useCallback(async (id: string, patch: ChatPrefPatch) => {
    const before = queryClient.getQueryData<ChatPref[]>(KEY) ?? [];
    const prev = before.find((p) => p.conversationId === id);
    const next = applyPatch(prev, id, patch);
    queryClient.setQueryData<ChatPref[]>(KEY, [...before.filter((p) => p.conversationId !== id), next]);
    try {
      const saved = await setChatPref(id, patch);
      queryClient.setQueryData<ChatPref[]>(KEY, (cur = []) => [...cur.filter((p) => p.conversationId !== id), saved]);
    } catch {
      queryClient.setQueryData<ChatPref[]>(KEY, before);
      toast.error(t('chatMenu.saveFailed', "Couldn't save that, try again"));
    }
  }, [queryClient, t]);

  return { byId, update };
}

/** True while a mute is still running. */
export function isMuted(pref: ChatPref | undefined): boolean {
  return !!pref?.mutedUntil && new Date(pref.mutedUntil).getTime() > Date.now();
}

/**
 * Archived, and nothing new has arrived since. A new message brings an
 * archived chat back into the list unless it is also muted.
 */
export function isArchived(pref: ChatPref | undefined, lastMessageAt?: string | null): boolean {
  if (!pref?.archivedAt) return false;
  if (isMuted(pref)) return true;
  if (!lastMessageAt) return true;
  return new Date(lastMessageAt).getTime() <= new Date(pref.archivedAt).getTime();
}

/** "Clear history": every message in the chat disappears for you only. */
export function useClearChatHistory() {
  const { walletAddress } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useCallback(async (conv: DeHubConversation) => {
    try {
      await clearConversationMessages(conv.id, walletAddress || undefined);
      queryClient.removeQueries({ queryKey: messagesKeys.messages(conv.id) });
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
      toast.success(t('chatMenu.cleared', 'History cleared'));
    } catch {
      toast.error(t('chatMenu.clearFailed', "Couldn't clear history, try again"));
    }
  }, [walletAddress, queryClient, t]);
}
