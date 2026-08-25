/**
 * Conversation identity
 * =====================
 * A DM conversation has TWO ids over its life. A thread that has never been
 * opened before starts as a client-side stand-in — "new_0x<address>", or the
 * bare address — and is replaced by a real Mongo ObjectId the moment the
 * server's contact list catches up, seconds later and with no user action.
 *
 * Anything keyed on `conversation.id` therefore silently resets at that moment:
 * a React `key` remounts the whole chat, a localStorage key writes to a fresh
 * slot and orphans the old one, and a draft in the composer is simply gone.
 *
 * This returns the one thing that does NOT change — who you are talking to.
 * Use it for React keys and cache keys; use `conversation.id` only when talking
 * to the API.
 *
 * @module lib/conversation-identity
 */

import type { DeHubConversation } from '@/lib/api/dehub';

/** True for the client-side stand-in ids that precede a real conversation. */
export function isVirtualConversationId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(id);
}

/** The peer's address for a 1:1 thread, lower-cased. Null for groups. */
export function conversationPeerAddress(conversation: DeHubConversation): string | null {
  if (conversation.isGroup || conversation.groupInfo) return null;
  const address =
    conversation.otherUser?.address ||
    conversation.participants?.find((p) => !!p?.address)?.address;
  if (address) return address.toLowerCase();
  // No participant data yet — a virtual id still carries the address in it.
  const id = conversation.id;
  if (id?.startsWith('new_')) return id.slice(4).toLowerCase();
  if (id && /^0x[0-9a-fA-F]{40}$/i.test(id)) return id.toLowerCase();
  return null;
}

/**
 * A stable identity string for a conversation, safe as a React key or a cache
 * key. Groups keep their id (always real); 1:1 threads use the peer address.
 */
export function conversationIdentity(conversation: DeHubConversation): string {
  if (conversation.isGroup || conversation.groupInfo) return `group:${conversation.id}`;
  const peer = conversationPeerAddress(conversation);
  return peer ? `dm:${peer}` : `dm-id:${conversation.id}`;
}
