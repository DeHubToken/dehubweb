/**
 * Feature Request Comments Hook
 * ==============================
 * Fetching, threading and reacting to comments on feature requests.
 *
 * These threads follow the post comment section's model on Supabase's tables:
 * replies hang off `parent_id`, reactions ride the same nine-reaction ladder
 * posts use, and your own row can be edited. What this is NOT is the same
 * component — post comments live on the DeHub API behind a tokenId, and until
 * feature requests move there this is a second implementation of one idea.
 * Keeping the vocabulary identical is what will make that move cheap.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getAccountSummariesByUsernames } from '@/lib/api/dehub';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { dehubAuthHeaders } from '@/lib/ai-invoke';
import type { PostReaction } from '@/lib/reactions';
import {
  attachReactions,
  buildThreads,
  resolveCommentAvatar,
  type CommentReactionRow,
  type CommentThread,
  type ThreadCommentRow,
  type ThreadedComment,
} from '@/lib/comment-threads';

export interface FeatureRequestComment extends ThreadedComment {
  feature_request_id: string;
}

/** A top-level comment with its replies, oldest first, at one visible level. */
export type FeatureRequestThread = CommentThread<FeatureRequestComment>;

interface CommentRow extends ThreadCommentRow {
  feature_request_id: string;
}

/**
 * Comments and their reactions, threaded.
 *
 * Reactions are a second query rather than an embedded select: PostgREST would
 * happily join them, but the join re-sends every reaction row on every refetch
 * of the list, and the list refetches whenever a card's comments are opened.
 * Two flat reads are smaller and cache independently.
 */
export function useFeatureRequestComments(featureRequestId: string | null) {
  const { walletAddress } = useAuth();
  const viewer = walletAddress?.toLowerCase() ?? null;

  return useQuery({
    queryKey: ['feature-request-comments', featureRequestId, viewer],
    queryFn: async (): Promise<FeatureRequestThread[]> => {
      if (!featureRequestId) return [];

      const { data, error } = await supabase
        .from('feature_request_comments')
        .select('*')
        .eq('feature_request_id', featureRequestId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = (data || []) as unknown as CommentRow[];
      if (rows.length === 0) return [];

      const { data: reactionData, error: reactionError } = await supabase
        .from('feature_request_comment_reactions')
        .select('comment_id, wallet_address, reaction')
        .in('comment_id', rows.map((row) => row.id));
      // Reactions that cannot be read must not take the thread with them: the
      // comments are the point, the tallies are decoration.
      if (reactionError) console.warn('[features] comment reactions unavailable', reactionError);
      const reactions = (reactionData || []) as unknown as CommentReactionRow[];

      // One visible level of nesting, like every other comment surface here: a
      // reply to a reply joins its root thread rather than starting its own.
      return buildThreads(attachReactions(rows, reactions, viewer));
    },
    enabled: !!featureRequestId,
    staleTime: 30_000,
  });
}

/**
 * Every distinct @handle in a comment, lowercased and capped, so one comment
 * cannot fan out into an unbounded number of profile lookups.
 */
function mentionedHandles(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/@([a-zA-Z0-9._]{1,30})/g)) {
    found.add(match[1].toLowerCase());
  }
  return [...found].slice(0, 5);
}

/**
 * Tell the people named in a comment.
 *
 * The database cannot do this. Postgres holds no profile table, so a trigger
 * has an @handle and no way to turn it into an address — the same reason
 * `community_here` and `stage_live` rows are written by the client.
 *
 * Best-effort by design: a handle that resolves to nobody, a lookup that
 * fails, an insert that is refused — none of them may cost the commenter their
 * comment, which is already saved by the time this runs.
 */
async function notifyMentions(params: {
  content: string;
  featureRequestId: string;
  featureTitle: string | null;
  actorAddress: string;
  actorUsername: string | null;
  actorAvatar: string | null;
  skipAddresses: string[];
}) {
  const handles = mentionedHandles(params.content);
  if (handles.length === 0) return;

  const skip = new Set(params.skipAddresses.map((address) => address.toLowerCase()));
  const recipients = new Set<string>();

  const mentionedAccounts = await getAccountSummariesByUsernames(handles).catch(() => []);
  mentionedAccounts.forEach(account => {
    const address = account.address.toLowerCase();
    if (address && !skip.has(address)) recipients.add(address);
  });

  if (recipients.size === 0) return;

  try {
    await supabase.from('custom_notifications').insert(
      [...recipients].map((address) => ({
        recipient_address: address,
        actor_address: params.actorAddress,
        actor_username: params.actorUsername,
        actor_avatar: params.actorAvatar,
        type: 'feature_request_mention',
        content: params.content.slice(0, 100),
        reference_id: params.featureRequestId,
        reference_title: params.featureTitle,
      })),
    );
  } catch {
    // The comment stands whether or not the mention row landed.
  }
}

/**
 * The assistant's trigger on this board, word-bounded.
 *
 * `@dehub` is deliberately not a trigger: it is a real user's handle, and the
 * chat bot's original regex matched it — so every "@dehub" answered on that
 * person's behalf. The same expression guards the server side; this copy only
 * decides whether the call is worth making at all.
 */
const ASSISTANT_MENTION_RE = /(^|[^a-zA-Z0-9_])@assistant(?![a-zA-Z0-9_])/i;

/**
 * Ask the assistant to answer a comment that tagged it.
 *
 * The reply is written server-side as a real comment owned by the assistant
 * account, so there is nothing to render here — only a refetch once it lands.
 * The board has no realtime channel, which is why this waits on the call
 * rather than hoping an invalidation catches it.
 */
async function requestAssistantReply(commentId: string): Promise<void> {
  await ensureFreshToken();
  const { error } = await supabase.functions.invoke('feature-request-assistant', {
    body: { commentId },
    headers: dehubAuthHeaders(),
  });
  if (error) throw error;
}

export function useSubmitComment() {
  const queryClient = useQueryClient();
  const { walletAddress, user } = useAuth();

  return useMutation({
    mutationFn: async ({
      featureRequestId,
      content,
      parentId,
      featureTitle,
      featureAuthorAddress,
      parentAuthorAddress,
    }: {
      featureRequestId: string;
      content: string;
      /** The comment being replied to, or nothing for a new thread. */
      parentId?: string | null;
      featureTitle?: string | null;
      /** Skipped when telling mentions — the trigger already told these two. */
      featureAuthorAddress?: string | null;
      parentAuthorAddress?: string | null;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const address = walletAddress.toLowerCase();
      const avatarPath = await resolveCommentAvatar(address, user?.avatarImageUrl, user?.username);
      const text = content.trim();

      const { data, error } = await supabase
        .from('feature_request_comments')
        .insert({
          feature_request_id: featureRequestId,
          wallet_address: address,
          username: user?.username || null,
          avatar: avatarPath,
          content: text,
          parent_id: parentId ?? null,
        })
        .select()
        .single()
        .setHeader('x-wallet-address', address);

      if (error) throw error;

      // Deliberately outside the mutation's error path: the comment is written,
      // and a failed mention lookup must not toast a failure over it.
      void notifyMentions({
        content: text,
        featureRequestId,
        featureTitle: featureTitle ?? null,
        actorAddress: address,
        actorUsername: user?.username || null,
        actorAvatar: avatarPath,
        skipAddresses: [address, featureAuthorAddress ?? '', parentAuthorAddress ?? ''].filter(Boolean),
      });

      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feature-request-comments', variables.featureRequestId] });

      // Tagging @assistant here gets an answer from the assistant itself, in
      // DeHub's own voice. This board is where the people who reported things
      // come back to ask whether the fix landed, and a question that sits
      // unanswered until somebody scrolls past is the whole problem. Fire and
      // forget: the comment is already saved, so a failed reply must not toast
      // an error over it.
      const newCommentId = (data as { id?: string } | null)?.id;
      if (newCommentId && ASSISTANT_MENTION_RE.test(variables.content)) {
        void requestAssistantReply(newCommentId)
          .then(() => {
            queryClient.invalidateQueries({
              queryKey: ['feature-request-comments', variables.featureRequestId],
            });
          })
          .catch(() => {
            // No reply this time. The thread is unchanged and still theirs.
          });
      }

      // Optimistically bump comment count without refetching the list (avoids reordering)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: ['feature-requests'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any[]) =>
            page.map((fr) => fr.id === variables.featureRequestId ? { ...fr, comment_count: (fr.comment_count || 0) + 1 } : fr)
          ),
        };
      });
    },
    onError: () => {
      toast.error('Failed to post comment');
    },
  });
}

export function useEditComment() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string; featureRequestId: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('feature_request_comments')
        .update({ content: content.trim(), updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .setHeader('x-wallet-address', walletAddress.toLowerCase());
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feature-request-comments', variables.featureRequestId] });
    },
    onError: () => {
      toast.error('Failed to save comment');
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async ({ commentId, featureRequestId }: { commentId: string; featureRequestId: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('feature_request_comments')
        .delete()
        .eq('id', commentId)
        .setHeader('x-wallet-address', walletAddress.toLowerCase());

      if (error) throw error;
      return { featureRequestId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feature-request-comments', variables.featureRequestId] });
      // Optimistically decrement comment count without refetching the list
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryClient.setQueriesData({ queryKey: ['feature-requests'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any[]) =>
            page.map((fr) => fr.id === variables.featureRequestId ? { ...fr, comment_count: Math.max(0, (fr.comment_count || 0) - 1) } : fr)
          ),
        };
      });
      toast.success('Comment deleted');
    },
    onError: () => {
      toast.error('Failed to delete comment');
    },
  });
}

/**
 * Cast, change or clear a reaction on a comment.
 *
 * One row per viewer per comment: tapping the face you already wear clears it,
 * tapping another replaces it. That is the polarity model posts use, with the
 * upsert standing in for the API's vote swap.
 */
export function useReactToComment() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async ({
      commentId,
      reaction,
      current,
    }: {
      commentId: string;
      reaction: PostReaction;
      /** What this viewer already had on the comment, for the toggle. */
      current: PostReaction | null;
      featureRequestId: string;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const address = walletAddress.toLowerCase();

      if (current === reaction) {
        const { error } = await supabase
          .from('feature_request_comment_reactions')
          .delete()
          .eq('comment_id', commentId)
          .eq('wallet_address', address)
          .setHeader('x-wallet-address', address);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('feature_request_comment_reactions')
        .upsert({ comment_id: commentId, wallet_address: address, reaction }, {
          onConflict: 'comment_id,wallet_address',
        })
        .setHeader('x-wallet-address', address);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feature-request-comments', variables.featureRequestId] });
    },
    onError: () => {
      toast.error('Failed to react');
    },
  });
}
