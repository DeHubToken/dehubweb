/**
 * Comment threading rules
 * =======================
 * The two decisions that keep a comment list reading as a conversation, kept
 * out of the components so both surfaces answer them the same way and so they
 * can be tested without mounting anything.
 */

import type { ApiCommentResponse } from '@/lib/api/dehub';

/**
 * The author's own thread: every straight comment the author left on their own
 * post (not a reply to anybody), oldest first, read like an X thread. These
 * render in the block under the card on the post page and are dropped from the
 * comments list, where the author's remaining straight comments lead the list
 * in the same order.
 *
 * Other people's comments and the author's replies are skipped rather than
 * ending the run — the author's thread always comes first, however late a
 * part of it was posted. The run does stop at the first entry somebody has
 * replied to: pulling that one out of the list would strand its replies there
 * with nothing above them, so it and everything after it stay at the top of
 * the list instead, which keeps the thread in posting order across the two.
 *
 * `rows` may be any window of the post's comments in any order.
 */
export function selectAuthorThreadEntries(
  rows: ApiCommentResponse[],
  authorAddress?: string,
): ApiCommentResponse[] {
  const author = authorAddress?.toLowerCase();
  if (!author) return [];

  const oldestFirst = rows
    .filter(row => !row.parentId && row.address?.toLowerCase() === author)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const entries: ApiCommentResponse[] = [];
  for (const row of oldestFirst) {
    if (row.replyIds?.length) break;
    entries.push(row);
  }
  return entries;
}

/**
 * Is some loaded reply's parent missing from the window?
 *
 * Comments come back as a flat page of the newest N, so a reply routinely
 * arrives while the comment it answers is still one or two pages back. Such a
 * reply is rendered as a top-level comment — the least bad option, since
 * dropping it would hide it outright — which is why the same person's "👍"
 * could appear three times in a row addressed to nobody. A missing parent is
 * always older than its reply and therefore always on a later page, so the
 * caller fixes this by fetching more.
 */
export function hasUnresolvedParent(rows: ApiCommentResponse[]): boolean {
  const loaded = new Set(rows.map(row => String(row.id)));
  return rows.some(row => row.parentId != null && !loaded.has(String(row.parentId)));
}

/**
 * Which threads keep the creator-replied lift, in the order the API gave them.
 *
 * Decided the first time a comment is seen and never again. The API lifts a
 * thread the moment the creator answers it, so honouring every refetch would
 * move the thread the creator had just replied in to the top of the list,
 * under them, while they worked their way down the comments — and a reader
 * would watch a thread jump away mid-scroll. What a comment looked like when
 * it first arrived is what the list keeps; the next open picks up the rest.
 *
 * `seen` and `lifted` are the caller's to keep across renders; both are
 * mutated. Returns a fresh id → rank map so it can drive a memo.
 */
export function recordCreatorLifts(
  rows: ApiCommentResponse[] | undefined,
  seen: Set<string>,
  lifted: Set<string>,
): Map<string, number> {
  for (const row of rows ?? []) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (row.creatorReplied) lifted.add(id);
  }
  return new Map([...lifted].map((id, rank) => [id, rank]));
}

interface PreviewReply {
  comment: { id: string; address?: string; replyToId?: string };
}

/**
 * The replies a collapsed thread shows.
 *
 * Normally the first `count`. When the creator has answered somewhere in the
 * thread, their first answer instead, with the replies it hangs from so it
 * never reads as addressed to nobody. That answer is why the thread sits at
 * the top: showing somebody else's reply in its place left a lifted thread
 * with no visible reason for being there.
 */
export function previewReplies<R extends PreviewReply>(
  replies: R[],
  creatorAddress: string | null | undefined,
  count: number,
): R[] {
  const creator = creatorAddress?.toLowerCase();
  const answer = creator
    ? replies.find(({ comment }) => comment.address?.toLowerCase() === creator)
    : undefined;
  if (!answer) return replies.slice(0, count);

  const byId = new Map(replies.map(reply => [reply.comment.id, reply]));
  const path = new Set<string>();
  for (
    let current: R | undefined = answer;
    current && !path.has(current.comment.id);
    current = current.comment.replyToId ? byId.get(current.comment.replyToId) : undefined
  ) {
    path.add(current.comment.id);
  }
  return replies.filter(({ comment }) => path.has(comment.id));
}
