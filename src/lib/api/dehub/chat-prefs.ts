import { apiCall } from './core';

/** One person's own settings for one chat (only they see them). */
export interface ChatPref {
  conversationId: string;
  pinnedAt: string | null;
  archivedAt: string | null;
  mutedUntil: string | null;
  markedUnread: boolean;
}

export interface ChatPrefPatch {
  pinned?: boolean;
  archived?: boolean;
  unread?: boolean;
  /** ISO time, 'forever', or null to unmute. */
  mutedUntil?: string | null;
}

export async function getChatPrefs(): Promise<ChatPref[]> {
  const res = await apiCall<{ result?: ChatPref[] }>('/api/dm/chat-prefs', { requiresAuth: true });
  return Array.isArray(res?.result) ? res.result : [];
}

export async function setChatPref(conversationId: string, patch: ChatPrefPatch): Promise<ChatPref> {
  const res = await apiCall<{ result: ChatPref }>(`/api/dm/chat-prefs/${conversationId}`, {
    method: 'POST',
    body: patch as Record<string, unknown>,
    requiresAuth: true,
  });
  return res.result;
}
