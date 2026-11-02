/**
 * Community chat notifications
 * ============================
 * Members of a community hear about its chat through one grouped row per
 * community ("James + 2 others sent messages in X"), built and throttled by the
 * DeHub API (backend community-chat-notification.service.ts). Two calls feed it:
 *
 * - report: the sender, right after a message is stored. The signed wallet
 *   session goes with it so the API can re-read the message and the member
 *   list under the sender's own row-level access.
 * - seen: whoever has the chat on screen, on open and every minute after. It
 *   clears that community's row and holds new pings while they are reading.
 *
 * Both are fire-and-forget: a missing notification is never a failed send.
 */
import { apiCall } from '@/lib/api/dehub/core';
import { ensureWalletSession } from '@/lib/wallet-session';

export const COMMUNITY_CHAT_SEEN_INTERVAL_MS = 60_000;

export async function reportCommunityChatMessage(communityId: string, messageId: string, walletAddress: string): Promise<void> {
  try {
    const session = await ensureWalletSession(walletAddress.toLowerCase());
    if (!session) return;
    await apiCall('/api/notification/community-chat', {
      method: 'POST',
      body: { communityId, messageId, walletSession: session.token },
      requiresAuth: true,
    });
  } catch (err) {
    console.warn('[CommunityChat] notify failed:', err);
  }
}

export async function markCommunityChatSeen(communityId: string): Promise<void> {
  try {
    await apiCall('/api/notification/community-chat/seen', {
      method: 'POST',
      body: { communityId },
      requiresAuth: true,
    });
  } catch {
    // Best effort: the worst case is one extra ping.
  }
}
