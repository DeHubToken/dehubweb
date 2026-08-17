/**
 * Community Mention Notifications
 * ===============================
 * Turns the @handles in a just-sent community chat message into notifications.
 *
 * Handles resolve to wallets here, in the client, because the account directory
 * lives in the DeHub API rather than in Supabase. The server is what decides who
 * may actually be notified — it drops non-members, drops the sender, and expands
 * @here from the membership table itself — so a wallet invented here buys
 * nothing. See supabase/migrations/20260817140000_community_chat_mentions.sql.
 */

import { callRpc } from '@/hooks/use-community-admin';
import { getAccountByUsername } from '@/lib/api/dehub';
import { parseCommunityMentions, hasCommunityMentions } from '@/lib/community-mentions';

/** Handles resolved per message. Mentioning more than this is spam, not a mention. */
const MAX_RESOLVED_HANDLES = 10;

interface NotifyArgs {
  communityId: string;
  messageId: string;
  content: string;
  walletAddress: string;
}

/**
 * Resolves the handles to wallet addresses, skipping any that do not resolve.
 * One unknown handle must not cost the others their notification, so failures
 * are per-handle rather than per-message.
 */
async function resolveHandles(handles: string[], viewer: string): Promise<string[]> {
  const settled = await Promise.allSettled(
    handles.slice(0, MAX_RESOLVED_HANDLES).map(handle => getAccountByUsername(handle, viewer)),
  );

  const wallets: string[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const address = result.value?.address;
    if (typeof address === 'string' && address.length > 0) wallets.push(address.toLowerCase());
  }
  return wallets;
}

export async function notifyCommunityMentions({
  communityId,
  messageId,
  content,
  walletAddress,
}: NotifyArgs): Promise<void> {
  const parsed = parseCommunityMentions(content);
  if (!hasCommunityMentions(parsed)) return;

  try {
    // @here already reaches every active member, so the individual handles in
    // the same message need no resolving — the server ignores them too.
    const wallets = parsed.here ? [] : await resolveHandles(parsed.usernames, walletAddress);
    if (!parsed.here && wallets.length === 0) return;

    await callRpc('community_notify_mentions', {
      _community_id: communityId,
      _message_id: messageId,
      _mentions: wallets.length > 0 ? wallets : null,
      _here: parsed.here,
    }, walletAddress);
  } catch (err) {
    // Deliberately quiet. The message itself posted fine, and the sender cannot
    // act on "the broadcast was rate limited" after the fact — surfacing it as a
    // toast would read as the message having failed.
    console.warn('[CommunityChat] mention notify failed:', err);
  }
}
