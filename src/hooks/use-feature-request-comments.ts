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
import { getAccountInfo, getAccountByUsername } from '@/lib/api/dehub';
import { extractAvatarPath } from '@/lib/media-url';
import {
  isPositiveReaction,
  type PostReaction,
  type ReactionCounts,
} from '@/lib/reactions';

export interface FeatureRequestComment {
  id: string;
  feature_request_id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  content: string;
  created_at: string;
  /** Null on a top-level comment; the comment being replied to otherwise. */
  parent_id: string | null;
  /** Set the first time the author edits it. */
  updated_at: string | null;
  /** Per-reaction tallies, for deciding which glyph leads. */
  reactionCounts: ReactionCounts;
  /** Everyone who reacted positively / negatively — the two visible counts. */
  likes: number;
  dislikes: number;
  /** What the signed-in viewer cast, if anything. */
  myReaction: PostReaction | null;
}

/** A top-level comment with its replies, oldest first, at one visible level. */
export interface FeatureRequestThread {
  comment: FeatureRequestComment;
  replies: FeatureRequestComment[];
}

interface CommentRow {
  id: string;
  feature_request_id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  content: string;
  created_at: string;
  parent_id: string | null;
  updated_at: string | null;
}

interface ReactionRow {
  comment_id: string;
  wallet_address: string;
  reaction: string;
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
      const reactions = (reactionData || []) as unknown as ReactionRow[];

      const byComment = new Map<string, ReactionRow[]>();
      for (const row of reactions) {
        const list = byComment.get(row.comment_id);
        if (list) list.push(row);
        else byComment.set(row.comment_id, [row]);
      }

      const comments: FeatureRequestComment[] = rows.map((row) => {
        const cast = byComment.get(row.id) ?? [];
        const counts: ReactionCounts = {};
        let likes = 0;
        let dislikes = 0;
        let myReaction: PostReaction | null = null;
        for (const one of cast) {
          const reaction = one.reaction as PostReaction;
          counts[reaction] = (counts[reaction] ?? 0) + 1;
          if (isPositiveReaction(reaction)) likes += 1;
          else dislikes += 1;
          if (viewer && one.wallet_address.toLowerCase() === viewer) myReaction = reaction;
        }
        return { ...row, reactionCounts: counts, likes, dislikes, myReaction };
      });

      // One visible level of nesting, like every other comment surface here: a
      // reply to a reply joins its root thread rather than starting its own.
      const roots = comments.filter((comment) => !comment.parent_id);
      const rootIds = new Set(roots.map((comment) => comment.id));
      const byId = new Map(comments.map((comment) => [comment.id, comment]));

      const rootFor = (comment: FeatureRequestComment): string | null => {
        let current = comment;
        // Bounded by the list length, so a cycle cannot outlive the walk.
        for (let hop = 0; hop < comments.length; hop += 1) {
          if (!current.parent_id) return current.id;
          if (rootIds.has(current.parent_id)) return current.parent_id;
          const parent = byId.get(current.parent_id);
          if (!parent) return null;
          current = parent;
        }
        return null;
      };

      const threads = new Map<string, FeatureRequestThread>(
        roots.map((comment) => [comment.id, { comment, replies: [] }]),
      );
      for (const comment of comments) {
        if (!comment.parent_id) continue;
        const root = rootFor(comment);
        // An orphan — its root deleted between the two reads — is dropped
        // rather than promoted; promoting it would reword the thread.
        if (root) threads.get(root)?.replies.push(comment);
      }

      return roots.map((comment) => threads.get(comment.id)!);
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

  await Promise.all(handles.map(async (handle) => {
    try {
      const account = await getAccountByUsername(handle);
      const address = (account?.address || account?.wallet_address || '').toLowerCase();
      if (!address || skip.has(address)) return;
      recipients.add(address);
    } catch {
      // No such handle, or the API is down. Either way, nobody to tell.
    }
  }));

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

/** The avatar to stamp on a new comment: auth context, then two lookups. */
async function resolveAvatar(
  walletAddress: string,
  authAvatar: string | null | undefined,
  username: string | null | undefined,
): Promise<string | null> {
  if (authAvatar) return authAvatar;
  try {
    const accountInfo = await getAccountInfo(walletAddress);
    const path = extractAvatarPath(accountInfo);
    if (path) return path;
  } catch {
    // continue to the username fallback
  }
  if (username) {
    try {
      const byUsername = await getAccountByUsername(username, walletAddress);
      return extractAvatarPath(byUsername) || null;
    } catch {
      // A comment without an avatar is still a comment.
    }
  }
  return null;
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
      const avatarPath = await resolveAvatar(address, user?.avatarImageUrl, user?.username);
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feature-request-comments', variables.featureRequestId] });
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
