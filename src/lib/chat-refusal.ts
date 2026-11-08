import { translateCopy } from '@/i18n/copy';

/** What the chat server sends back when it refuses a message. */
export interface ChatRefusalPayload {
  message?: string;
  code?: string;
  rule?: string;
  retryAfterSeconds?: number;
}

/** "3 min" / "40s": the wait in a slow-down message. */
export function formatChatWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s}s`;
}

/**
 * The line to show for a refused chat message. The main chat's anti-flood
 * ("slow down") is said in the viewer's own words with the wait; everything
 * else is the server's own reason.
 */
export function chatRefusalText(data: ChatRefusalPayload | null | undefined): string {
  if (data?.code === 'SLOW_DOWN' && typeof data.retryAfterSeconds === 'number') {
    return translateCopy('copy.chatSlowDown', {
      defaultValue: 'Slow down! Too many messages in a row. Try again in {{wait}}, or wait for someone else to reply.',
      wait: formatChatWait(data.retryAfterSeconds),
    });
  }
  return data?.message || translateCopy('copy.4e957da5c208', { defaultValue: 'Message was not sent' });
}

/**
 * The server took the connection as signed out. Not the person's doing: the
 * connection came back with an expired token. Callers sign in again and retry
 * instead of showing it. Older servers send only the message, no code.
 */
export const isAuthRefusal = (data: ChatRefusalPayload | null | undefined): boolean =>
  data?.code === 'AUTH_REQUIRED' || /^authentication required\.?$/i.test(String(data?.message || '').trim());

/** An error the chat already showed the user, so callers should not toast it again. */
export class ShownChatError extends Error {
  readonly shown = true;
}

export const wasShownToUser = (err: unknown): boolean => !!(err as { shown?: boolean } | null)?.shown;
