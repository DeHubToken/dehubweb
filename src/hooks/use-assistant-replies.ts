/**
 * Shared @assistant auto-reply state — LEGACY FALLBACK.
 * =====================================================
 * Stores AI replies in a module-level singleton so every consumer
 * (PublicChat, SidebarChat, etc.) renders the same local-only assistant
 * messages. Detection + reply firing is also centralized here so we never
 * double-respond when more than one chat surface is mounted.
 *
 * These replies are web-only and NOT persisted — only the person who typed the
 * mention ever sees them, and they vanish on reload. The API now answers
 * mentions properly, by posting a real message the whole room receives.
 *
 * This stays purely to cover the window where the web app is deployed and the
 * API side is not: without it, `@assistant` in chat would do nothing at all.
 * It disables itself as soon as a real assistant message appears in the room,
 * so the two can never both answer. Delete this file once the API side has
 * shipped.
 *
 * It also refuses to answer anything but a mention from the last couple of
 * minutes. The "already answered" set below lives in the tab and is wiped on
 * every page load, and the room history it scans goes back months — so without
 * an age bound, opening chat re-answers whatever the viewer's newest mention
 * was, however old. That is not theoretical: a question from eleven days
 * earlier came back as a fresh reply, stamped with the current time and sorted
 * to the bottom of the room, looking like the bot had finally woken up.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isAssistantAddress } from '@/lib/assistant';
import type { SupabaseLiveChatMessage } from './use-livechat';

export interface AssistantReply {
  id: string;
  content: string;
  timestamp: Date;
  replyToName?: string;
  /** id of the source chat message that triggered this reply */
  sourceMessageId: string;
}

/**
 * How recent a mention has to be before this fallback will answer it.
 *
 * Long enough to cover the real case — you typed it, the socket round-trip and
 * a reload happened, the API still is not answering — and far too short to
 * reach back into history.
 */
const MAX_MENTION_AGE_MS = 2 * 60 * 1000;

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

    // Stand down once the API is answering mentions itself. One real assistant
    // message in the room is proof it is live, and its reply is the better one
    // — persisted, and visible to everyone rather than just the asker.
    if (messages.some((m) => isAssistantAddress(m.sender_address))) return;

    // Find newest unresponded @assistant mention authored by the current user,
    // within the age bound — see MAX_MENTION_AGE_MS. A message with no parsable
    // timestamp is treated as old, because the only thing worse than missing a
    // reply is answering a question the room moved on from days ago.
    const now = Date.now();
    const candidate = [...messages].reverse().find((m) => {
      if (respondedIds.has(m.id) || inFlightIds.has(m.id)) return false;
      if (!m.content) return false;
      if (!/@assistant\b/i.test(m.content)) return false;
      const sentAt = Date.parse(m.created_at);
      if (!Number.isFinite(sentAt) || now - sentAt > MAX_MENTION_AGE_MS) return false;
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
