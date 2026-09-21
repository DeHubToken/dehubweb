/**
 * Comment threads on Supabase tables
 * ==================================
 * The shape and the folding shared by every Supabase-backed comment thread —
 * feature requests and governance proposals today. Rows carry `parent_id`,
 * reactions live in a sibling table keyed on the comment, and the thread shows
 * one visible level of nesting: a reply to a reply joins its root thread rather
 * than starting its own, the same rule the post comment section applies.
 *
 * Post comments live on the DeHub API behind a tokenId and do not come through
 * here; this is the vocabulary that will make moving these threads there cheap.
 */

import { isPositiveReaction, type PostReaction, type ReactionCounts } from '@/lib/reactions';
import { getAccountInfo, getAccountByUsername } from '@/lib/api/dehub';
import { extractAvatarPath } from '@/lib/media-url';

/** The columns every threaded comment row carries, whichever table it is in. */
export interface ThreadCommentRow {
  id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  content: string;
  created_at: string;
  /** Null on a top-level comment; the comment being replied to otherwise. */
  parent_id: string | null;
  /** Set the first time the author edits it. */
  updated_at: string | null;
}

/** A row with its reactions folded in, ready to render. */
export interface ThreadedComment extends ThreadCommentRow {
  /** Per-reaction tallies, for deciding which glyph leads. */
  reactionCounts: ReactionCounts;
  /** Everyone who reacted positively / negatively — the two visible counts. */
  likes: number;
  dislikes: number;
  /** What the signed-in viewer cast, if anything. */
  myReaction: PostReaction | null;
}

/** A top-level comment with its replies, oldest first, at one visible level. */
export interface CommentThread<C extends ThreadedComment = ThreadedComment> {
  comment: C;
  replies: C[];
}

export interface CommentReactionRow {
  comment_id: string;
  wallet_address: string;
  reaction: string;
}

/** Fold the reaction rows onto their comments. */
export function attachReactions<R extends ThreadCommentRow>(
  rows: R[],
  reactions: CommentReactionRow[],
  viewer: string | null,
): (R & ThreadedComment)[] {
  const byComment = new Map<string, CommentReactionRow[]>();
  for (const row of reactions) {
    const list = byComment.get(row.comment_id);
    if (list) list.push(row);
    else byComment.set(row.comment_id, [row]);
  }

  return rows.map((row) => {
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
}

/**
 * Group comments into threads, one visible level deep.
 *
 * An orphan — its root deleted between two reads — is dropped rather than
 * promoted; promoting it would reword the thread.
 */
export function buildThreads<C extends ThreadedComment>(comments: C[]): CommentThread<C>[] {
  const roots = comments.filter((comment) => !comment.parent_id);
  const rootIds = new Set(roots.map((comment) => comment.id));
  const byId = new Map(comments.map((comment) => [comment.id, comment]));

  const rootFor = (comment: C): string | null => {
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

  const threads = new Map<string, CommentThread<C>>(
    roots.map((comment) => [comment.id, { comment, replies: [] }]),
  );
  for (const comment of comments) {
    if (!comment.parent_id) continue;
    const root = rootFor(comment);
    if (root) threads.get(root)?.replies.push(comment);
  }

  return roots.map((comment) => threads.get(comment.id)!);
}

/** How many comments a set of threads holds, replies included. */
export function countThreadComments(threads: CommentThread[] | undefined): number {
  return (threads ?? []).reduce((sum, thread) => sum + 1 + thread.replies.length, 0);
}

/** The avatar to stamp on a new comment: auth context, then two lookups. */
export async function resolveCommentAvatar(
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
