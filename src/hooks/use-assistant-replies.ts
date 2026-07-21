/**
 * Shared @assistant auto-reply state.
 * =====================================
 * Stores AI replies in a module-level singleton so every consumer
 * (PublicChat, SidebarChat, etc.) renders the same local-only assistant
 * messages. Detection + reply firing is also centralized here so we never
 * double-respond when more than one chat surface is mounted.
 *
 * This is web-app-only — replies are NOT persisted to the chat API.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { SupabaseLiveChatMessage } from './use-livechat';

export interface AssistantReply {
  id: string;
  content: string;
  timestamp: Date;
  replyToName?: string;
  /** id of the source chat message that triggered this reply */
  sourceMessageId: string;
}

// ---- Singleton store ----
let replies: AssistantReply[] = [];
const listeners = new Set<() => void>();
const respondedIds = new Set<string>();
const inFlightIds = new Set<string>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): AssistantReply[] {
  return replies;
}

function pushReply(r: AssistantReply) {
  // Session-capped: replies are local-only chat bubbles; keep the newest 50.
  // respondedIds mirrors the trim so the Sets can't grow unbounded either
  // (a trimmed source message can no longer re-trigger — its id ages out of
  // the live-chat 300-message window long before this cap matters).
  replies = [...replies, r].slice(-50);
  if (respondedIds.size > 500) {
    // Keep the newest half (Set preserves insertion order) — a full clear
    // could let a still-visible mention re-trigger a duplicate reply.
    const keep = [...respondedIds].slice(-250);
    respondedIds.clear();
    keep.forEach((id) => respondedIds.add(id));
  }
  emit();
}

/** Read-only access to the global assistant replies list. */
export function useAssistantReplies(): AssistantReply[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Mounts the @assistant detection + reply pipeline.
 * Safe to call from multiple components — only the message author triggers
 * a reply, and the in-flight set guarantees one fetch per source message
 * even if both PublicChat and SidebarChat are mounted at once.
 */
export function useAssistantReplyEngine(messages: SupabaseLiveChatMessage[]) {
  const { walletAddress } = useAuth();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (!walletAddress) return;
    const wallet = walletAddress.toLowerCase();

    // Find newest unresponded @assistant mention authored by the current user.
    const candidate = [...messages].reverse().find((m) => {
      if (respondedIds.has(m.id) || inFlightIds.has(m.id)) return false;
      if (!m.content) return false;
      if (!/@assistant\b/i.test(m.content)) return false;
      return (m.sender_address || '').toLowerCase() === wallet;
    });
    if (!candidate) return;

    inFlightIds.add(candidate.id);

    // Build a small history (last ~6 messages) for context
    const all = messagesRef.current;
    const idx = all.findIndex((m) => m.id === candidate.id);
    const start = Math.max(0, idx - 6);
    const history = all.slice(start, idx + 1).map((m) => ({
      role: 'user' as const,
      content: `${m.sender_display_name || m.sender_username || m.sender_address?.slice(0, 6) || 'User'}: ${m.content}`,
    }));
    const userQuestion = candidate.content.replace(/@assistant/gi, '').trim() || 'Hello';
    const replyToName =
      candidate.sender_username ||
      candidate.sender_display_name ||
      candidate.sender_address?.slice(0, 6) ||
      'User';

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('general-ai-chat', {
          body: {
            messages: [
              {
                role: 'system',
                content:
                  'You are @assistant, the official DeHub AI helper replying inside a public chat room. ' +
                  'CRITICAL: Keep your reply to ONE short message under 400 characters. ' +
                  'No markdown, no link formatting like [text](url) — paste raw URLs only. ' +
                  'Be friendly, concise, and answer the most important question first. ' +
                  'If you cannot help, say so in one short sentence.',
              },
              ...history.slice(0, -1),
              { role: 'user', content: userQuestion },
            ],
          },
        });
        if (error) throw error;
        let responseText: string = (data?.response || '').trim();
        if (!responseText) {
          inFlightIds.delete(candidate.id);
          return;
        }
        responseText = responseText.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$2');
        if (responseText.length > 500) {
          responseText = responseText.slice(0, 499).trimEnd() + '…';
        }
        respondedIds.add(candidate.id);
        inFlightIds.delete(candidate.id);
        pushReply({
          id: `${candidate.id}-${Date.now()}`,
          content: responseText,
          timestamp: new Date(),
          replyToName,
          sourceMessageId: candidate.id,
        });
      } catch (err) {
        console.warn('[AssistantReplies] Auto-reply failed:', err);
        inFlightIds.delete(candidate.id);
      }
    })();
  }, [messages, walletAddress]);
}
