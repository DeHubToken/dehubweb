/**
 * Proposal Discussion Hook
 * ========================
 * Fetching, threading and reacting to comments on governance proposals.
 *
 * The same model as feature-request comments (`use-feature-request-comments`):
 * replies hang off `parent_id`, reactions ride the nine-reaction ladder posts
 * use, and your own row can be edited. Only the tables and the cache keys
 * differ — the folding lives in `lib/comment-threads`.
 *
 * A reply tells the parent comment's author through the table's trigger
 * (`governance_reply`); the proposal's author hears about every comment the
 * same way. Nothing is written by the client beyond the comment itself.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  attachReactions,
  buildThreads,
  resolveCommentAvatar,
  type CommentReactionRow,
  type CommentThread,
  type ThreadCommentRow,
  type ThreadedComment,
} from '@/lib/comment-threads';
import type { PostReaction } from '@/lib/reactions';

interface ProposalCommentRow extends ThreadCommentRow {
  proposal_id: string;
}

export interface ProposalComment extends ThreadedComment {
  proposal_id: string;
}

export type ProposalThread = CommentThread<ProposalComment>;

/** Keyed by viewer too: `myReaction` is theirs, so the cache must be. */
export const proposalDiscussionKey = (proposalId: string | null, viewer: string | null) =>
  ['governance-comments', proposalId, viewer] as const;

/** Everything a comment write touches: the thread, and the counts on the boards. */
function invalidateProposalCaches(queryClient: ReturnType<typeof useQueryClient>, proposalId: string) {
  queryClient.invalidateQueries({ queryKey: ['governance-comments', proposalId] });
  queryClient.invalidateQueries({ queryKey: ['governance-proposal', proposalId] });
  queryClient.invalidateQueries({ queryKey: ['governance-proposals'] });
  queryClient.invalidateQueries({ queryKey: ['governance-proposals-completed'] });
}

/**
 * Comments and their reactions, threaded.
 *
 * Two flat reads rather than an embedded select, for the reason the feature
 * board gives: a join re-sends every reaction row on every refetch of the list.
 */
export function useProposalDiscussion(proposalId: string | null) {
  const { walletAddress } = useAuth();
  const viewer = walletAddress?.toLowerCase() ?? null;

  return useQuery({
    queryKey: proposalDiscussionKey(proposalId, viewer),
    queryFn: async (): Promise<ProposalThread[]> => {
      if (!proposalId) return [];

      const { data, error } = await supabase
        .from('governance_comments')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = (data || []) as unknown as ProposalCommentRow[];
      if (rows.length === 0) return [];

      const { data: reactionData, error: reactionError } = await supabase
        .from('governance_comment_reactions')
        .select('comment_id, wallet_address, reaction')
        .in('comment_id', rows.map((row) => row.id));
      // Reactions that cannot be read must not take the thread with them: the
      // comments are the point, the tallies are decoration.
      if (reactionError) console.warn('[governance] comment reactions unavailable', reactionError);
      const reactions = (reactionData || []) as unknown as CommentReactionRow[];

      return buildThreads(attachReactions(rows, reactions, viewer));
    },
    enabled: !!proposalId,
    staleTime: 30_000,
  });
}

export function useSubmitProposalComment() {
  const queryClient = useQueryClient();
  const { walletAddress, user } = useAuth();

  return useMutation({
    mutationFn: async ({
      proposalId,
      content,
      parentId,
    }: {
      proposalId: string;
      content: string;
      /** The comment being replied to, or nothing for a new thread. */
      parentId?: string | null;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const address = walletAddress.toLowerCase();
      const avatarPath = await resolveCommentAvatar(address, user?.avatarImageUrl, user?.username);

      const { data, error } = await supabase
        .from('governance_comments')
        .insert({
          proposal_id: proposalId,
          wallet_address: address,
          username: user?.username || null,
          avatar: avatarPath,
          content: content.trim(),
          parent_id: parentId ?? null,
        })
        .select()
        .single()
        .setHeader('x-wallet-address', address);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      invalidateProposalCaches(queryClient, variables.proposalId);
    },
    onError: () => {
      toast.error('Failed to post comment');
    },
  });
}

export function useEditProposalComment() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string; proposalId: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('governance_comments')
        .update({ content: content.trim(), updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .setHeader('x-wallet-address', walletAddress.toLowerCase());
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['governance-comments', variables.proposalId] });
    },
    onError: () => {
      toast.error('Failed to save comment');
    },
  });
}

export function useDeleteProposalComment() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  return useMutation({
    mutationFn: async ({ commentId }: { commentId: string; proposalId: string }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('governance_comments')
        .delete()
        .eq('id', commentId)
        .setHeader('x-wallet-address', walletAddress.toLowerCase());
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      invalidateProposalCaches(queryClient, variables.proposalId);
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
 * tapping another replaces it.
 */
export function useReactToProposalComment() {
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
      proposalId: string;
    }) => {
      if (!walletAddress) throw new Error('Not authenticated');
      const address = walletAddress.toLowerCase();

      if (current === reaction) {
        const { error } = await supabase
          .from('governance_comment_reactions')
          .delete()
          .eq('comment_id', commentId)
          .eq('wallet_address', address)
          .setHeader('x-wallet-address', address);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('governance_comment_reactions')
        .upsert({ comment_id: commentId, wallet_address: address, reaction }, {
          onConflict: 'comment_id,wallet_address',
        })
        .setHeader('x-wallet-address', address);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['governance-comments', variables.proposalId] });
    },
    onError: () => {
      toast.error('Failed to react');
    },
  });
}
