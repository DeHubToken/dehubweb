/**
 * Engagement State
 * ================
 * The single canonical way to READ a post's like/dislike counts, to WRITE an
 * optimistic vote onto a cached post, and to MERGE an authoritative refetch
 * over what we already hold. Feeds, the dedicated post page, the
 * pre-navigation cache seed and the vote patches all go through here.
 *
 * Why this has to live in one place — the API's post shape:
 *
 *   { totalVotes: { for: 144, against: 2 }, likes: 7, isLiked: true }
 *
 * - `totalVotes.for` is the real like count. It matches `/api/post-likers`
 *   pagination.totalCount exactly (verified on 2149/61/742/254).
 * - `likes` is a legacy field that is usually absent and, when present,
 *   disagrees (7 vs 144). Preferring it — as the feed mappers used to —
 *   showed one number in the feed and another on the post's own page.
 * - Keys are OMITTED rather than zeroed: a post nobody has liked has no
 *   `totalVotes` and no `likes` at all (33 of 400 posts sampled). Code that
 *   patches a count only `if (item.totalVotes)` therefore silently no-ops on
 *   exactly the posts a first like matters most for — the optimistic count
 *   lived only in ActionBar's local state, and the post's own page (seeded
 *   from the feed item) opened showing 0 likes before the network corrected
 *   it to 1.
 * - Viewer flags (`isLiked`, `isSaved`, …) are absent from a response served
 *   anonymously. api.dehub.io answers a request carrying an expired token with
 *   200 and no flags instead of 401, so a refetch can otherwise downgrade
 *   "you liked this" to "you didn't" with no error anywhere.
 *
 * @module lib/engagement
 */

import {
  asReaction,
  seedReactionCounts,
  type PostReaction,
  type ReactionCounts,
} from '@/lib/reactions';

/** A local/optimistic vote result, as stored in the vote cache. */
export interface VoteState {
  isLiked: boolean;
  isDisliked: boolean;
  likeCount: number;
  dislikeCount: number;
  /**
   * Which of the nine reactions the viewer holds, or null for none.
   *
   * OPTIONAL ON PURPOSE — `isLiked`/`isDisliked` remain the source of truth for
   * polarity, and surfaces that only ever cast a plain like (the shorts viewer,
   * governance cards) can keep writing a 4-field VoteState. Omitted means
   * "unchanged", not "cleared": `applyVoteStateToNFT` only writes `myReaction`
   * when the key is present, so a plain like from one surface can't erase the
   * fact that the viewer loved the post from another.
   */
  myReaction?: PostReaction | null;
  /** Per-reaction totals after the change. Same optionality rule as above. */
  reactionCounts?: ReactionCounts;
}

/**
 * The count-bearing fields shared by /api/feed items, /api/nft_info responses
 * and the Supabase-sourced pinned-post rows (`like_count`).
 */
export interface CountSource {
  totalVotes?: { for?: number; against?: number } | null;
  likes?: number | unknown[] | null;
  dislikes?: number | unknown[] | null;
  like_count?: number | null;
  dislike_count?: number | null;
  /** Per-reaction tally. Absent on posts only ever voted on the old way. */
  reactionCounts?: ReactionCounts | null;
  /** The viewer's own reaction — a viewer field, absent on anonymous responses. */
  myReaction?: string | null;
}

/** Legacy `likes` is a number on most rows and an array of voters on a few. */
function toCount(value: number | unknown[] | null | undefined): number | undefined {
  if (Array.isArray(value)) return value.length;
  return typeof value === 'number' ? value : undefined;
}

/** Canonical like count for any API-shaped post object. */
export function resolveLikeCount(source: CountSource | null | undefined): number {
  if (!source) return 0;
  return source.totalVotes?.for ?? toCount(source.likes) ?? toCount(source.like_count) ?? 0;
}

/** Canonical dislike count for any API-shaped post object. */
export function resolveDislikeCount(source: CountSource | null | undefined): number {
  if (!source) return 0;
  return source.totalVotes?.against ?? toCount(source.dislikes) ?? toCount(source.dislike_count) ?? 0;
}

/**
 * Write a vote onto an API-shaped post object.
 *
 * `totalVotes` is always written (created when the post had no votes yet —
 * the case the old `if (item.totalVotes)` guard skipped), and the legacy
 * `likes`/`dislikes` mirrors are kept in sync only when the object already
 * carries them, so we never invent a legacy field.
 */
export function applyVoteStateToNFT<T extends CountSource>(nft: T, state: VoteState): T {
  const patched: CountSource & Record<string, unknown> = {
    ...(nft as Record<string, unknown>),
    isLiked: state.isLiked,
    isDisliked: state.isDisliked,
    totalVotes: { ...(nft.totalVotes ?? {}), for: state.likeCount, against: state.dislikeCount },
  };
  if (typeof nft.likes === 'number') patched.likes = state.likeCount;
  if (typeof nft.dislikes === 'number') patched.dislikes = state.dislikeCount;
  if (typeof nft.like_count === 'number') patched.like_count = state.likeCount;
  if (typeof nft.dislike_count === 'number') patched.dislike_count = state.dislikeCount;
  // Only written when the caller actually resolved a reaction — see VoteState.
  if ('myReaction' in state) patched.myReaction = state.myReaction ?? null;
  if (state.reactionCounts) patched.reactionCounts = state.reactionCounts;
  return patched as T;
}

/**
 * Canonical per-reaction tally for any API-shaped post.
 *
 * Falls back to seeding from the polarity counts when the post carries no
 * `reactionCounts` — every vote cast before multi-reaction shipped is a bare
 * boolean, so a long-lived post arrives with a large `totalVotes.for` and no
 * breakdown at all. Treating that as "no reactions" would blank the summary on
 * exactly the posts with the most engagement.
 */
export function resolveReactionCounts(source: CountSource | null | undefined): ReactionCounts {
  const stored = source?.reactionCounts;
  if (stored && Object.values(stored).some((value) => (value ?? 0) > 0)) return stored;
  return seedReactionCounts(resolveLikeCount(source), resolveDislikeCount(source));
}

/** The viewer's own reaction on an API-shaped post, or null. */
export function resolveMyReaction(source: CountSource | null | undefined): PostReaction | null {
  if (!source) return null;
  const explicit = asReaction(source.myReaction);
  if (explicit) return explicit;
  // Pre-reaction API build, or a viewer whose vote predates the feature:
  // derive from the polarity flags so the button still lights up correctly.
  const record = source as unknown as Record<string, unknown>;
  if (record.isLiked === true) return 'like';
  if (record.isDisliked === true) return 'dislike';
  return null;
}

/**
 * Per-viewer fields the API adds only once it recognises the caller. A response
 * carrying none of them was served anonymously (expired token → 200, no flags).
 */
export const VIEWER_FIELDS = [
  'isLiked',
  'isDisliked',
  'myReaction',
  'isSaved',
  'isReposted',
  'isOwner',
  'isUnlocked',
] as const;

/** True when a post object carries at least one resolved viewer flag. */
export function hasViewerFields(post: unknown): boolean {
  if (!post || typeof post !== 'object') return false;
  const record = post as Record<string, unknown>;
  return VIEWER_FIELDS.some((field) => record[field] !== undefined);
}

/**
 * Merge an authoritative fetch over the copy we already had.
 *
 * Counts always come from `fresh` (they're global and correct even when the
 * response is anonymous). Viewer flags are carried over from `previous` only
 * when `fresh` has none — otherwise a token that expired mid-session makes a
 * liked post render unliked on its own page while the feed still shows it lit.
 */
export function mergeViewerState<T>(fresh: T, previous: Partial<T> | null | undefined): T {
  if (!fresh || typeof fresh !== 'object') return fresh;
  if (!previous || typeof previous !== 'object') return fresh;
  if (hasViewerFields(fresh)) return fresh;

  const prev = previous as Record<string, unknown>;
  const carried: Record<string, unknown> = {};
  for (const field of VIEWER_FIELDS) {
    if (prev[field] !== undefined) carried[field] = prev[field];
  }
  return Object.keys(carried).length > 0 ? ({ ...fresh, ...carried } as T) : fresh;
}
