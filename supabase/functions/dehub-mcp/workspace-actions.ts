import { z } from 'zod';
import { checked } from './controls.ts';

export const moderationSchema = {
  token_id: z.string().regex(/^\d+$/),
  target_wallet: z.string().regex(/^0x[0-9a-f]{40}$/i),
  seconds: z.number().int().min(30).max(3600),
};
export async function workspaceApi(token: string, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`https://api.dehub.io${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error' });
  const data = await response.json();
  if (!response.ok || data.status === false || data.result === false || data.error) throw new Error('The platform could not confirm this action. Check activity before retrying.');
  return data.result ?? data;
}

// Only snapshot state required for a reversal, never credentials or full profiles.
export async function captureUndo(token: string, tool: string, args: any) {
  if (tool === 'dehub_vote') {
    const post = await workspaceApi(token, `/api/nft_info/${encodeURIComponent(args.token_id)}`);
    if (typeof post.isLiked !== 'boolean' || typeof post.isDisliked !== 'boolean') return null;
    return { like: post.isLiked, dislike: post.isDisliked };
  }
  if (tool === 'dehub_follow') {
    const profile = await workspaceApi(token, `/api/account_info/${encodeURIComponent(args.target_wallet)}`);
    if (typeof profile.isFollowing !== 'boolean' || profile.isFollowRequestPending) return null;
    return { following: profile.isFollowing };
  }
  return null;
}

export function reversalLabel(receipt: any): string | null {
  if (receipt.status !== 'succeeded' || receipt.rollback_status || receipt.result?.skipped) return null;
  if (receipt.tool === 'dehub_post_create' && /^\d+$/.test(String(receipt.result?.post?.token_id))) return 'Hide published post';
  if (receipt.tool === 'dehub_comment' && /^\d+$/.test(String(receipt.result?.comment_id))) return 'Delete published comment';
  if (receipt.tool === 'dehub_vote' && receipt.undo) return 'Restore previous reaction';
  if (receipt.tool === 'dehub_follow' && receipt.undo?.following === false && receipt.arguments.action === 'follow') return 'Undo new follow';
  return null;
}

export async function reverseReceipt(db: any, token: string, receipt: any) {
  if (!reversalLabel(receipt)) throw new Error('This action cannot be reversed automatically.');
  const claimed = checked(await db.from('ai_agent_receipts').update({ rollback_status: 'executing', updated_at: new Date().toISOString() })
    .eq('id', receipt.id).eq('status', 'succeeded').is('rollback_status', null).select('id'));
  if (!claimed.length) throw new Error('This reversal has already been handled.');
  try {
    const args = receipt.arguments;
    if (receipt.tool === 'dehub_post_create') {
      await workspaceApi(token, '/api/token_visibility', 'POST', { id: Number(receipt.result.post.token_id), isHidden: true });
    } else if (receipt.tool === 'dehub_comment') {
      await workspaceApi(token, '/api/delete_comment', 'DELETE', { commentId: Number(receipt.result.comment_id) });
    } else if (receipt.tool === 'dehub_follow') {
      await workspaceApi(token, '/api/request_follow', 'POST', { following: args.target_wallet.toLowerCase(), unFollowing: true });
    } else {
      const current = await captureUndo(token, receipt.tool, args);
      if (!current) throw new Error('The current reaction cannot be verified.');
      const prior = receipt.undo;
      if (current.like !== prior.like || current.dislike !== prior.dislike) {
        const votedLike = args.vote_type === 'like';
        const wasSame = votedLike ? prior.like : prior.dislike;
        const expected = { like: votedLike && !wasSame, dislike: !votedLike && !wasSame };
        if (current.like !== expected.like || current.dislike !== expected.dislike) throw new Error('The reaction changed after this action. Review it directly instead.');
        // One toggle restores the previous vote or removes a newly added vote.
        const vote = prior.like ? true : prior.dislike ? false : current.like;
        await workspaceApi(token, `/api/request_vote?vote=${vote}`, 'POST', { streamTokenId: Number(args.token_id), vote });
      }
      const restored = await captureUndo(token, receipt.tool, args);
      if (!restored || restored.like !== prior.like || restored.dislike !== prior.dislike) throw new Error('Reaction restoration could not be verified.');
    }
    checked(await db.from('ai_agent_receipts').update({ rollback_status: 'succeeded', updated_at: new Date().toISOString() }).eq('id', receipt.id));
  } catch (error) {
    checked(await db.from('ai_agent_receipts').update({ rollback_status: 'uncertain', updated_at: new Date().toISOString() }).eq('id', receipt.id));
    throw error;
  }
}

export const alertWebhook = z.string().max(300).refine(value => value === '' || /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(value), 'Use a Discord webhook URL without query parameters.');
export async function deliverAlert(db: any, agentId: string, webhook: string, receiptId: string, status: string) {
  if (!webhook || !alertWebhook.safeParse(webhook).success) return;
  // A per-agent cooldown is claimed before delivery. Failures never trigger retries.
  const cutoff = new Date(Date.now() - 3600000).toISOString();
  const claimed = checked(await db.from('ai_agent_controls').update({ last_alert_at: new Date().toISOString() }).eq('agent_id', agentId)
    .or(`last_alert_at.is.null,last_alert_at.lt.${cutoff}`).select('agent_id'));
  if (!claimed.length) return;
  let delivered = false;
  try {
    const response = await fetch(webhook, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `A DeHub action needs attention (${status}). Review it at https://dehub.io/agents`, allowed_mentions: { parse: [] } }) });
    delivered = response.ok;
  } catch { /* Delivery failures must not retry public actions. */ }
  checked(await db.from('ai_agent_receipts').update({ alert_delivery: delivered ? 'delivered' : 'failed' }).eq('id', receiptId));
}
