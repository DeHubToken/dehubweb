/**
 * Comment threading rules
 * =======================
 * The two decisions that keep a comment list reading as a conversation, kept
 * out of the components so both surfaces answer them the same way and so they
 * can be tested without mounting anything.
 */

import type { ApiCommentResponse } from '@/lib/api/dehub';

/**
 * The author's continuation of their own post: the run of comments at the very
 * start that are the author's own straight comments and that nobody has
 * replied to. Those are the X-style "thread" you tack onto a post, and they
 * render above the card instead of in the list.
 *
 * The run stops at the first comment that fails any of the three tests, and
 * everything from there on belongs in the comments list:
 *
 * - somebody else has spoken, so the author is now talking *in* the
 *   conversation rather than continuing the post. Without this, a "thanks"
 *   written two minutes after someone's comment was hoisted above the comment
 *   it answered, in a separate block, in the wrong time order — which reads as
 *   replies not connecting to each other, because they visibly don't;
 * - the author's comment is itself a reply, which belongs under its parent;
 * - somebody replied to it, and pulling it out of the list would strand those
 *   replies there as top-level comments with nothing above them.
 *
 * `rows` may be any window of the post's comments in any order. If it does not
 * reach back to the post's first comment the run simply comes back empty,
 * which costs nothing: the entries stay in the list where they still read
 * correctly.
 */
export function selectAuthorThreadEntries(
  rows: ApiCommentResponse[],
  authorAddress?: string,
): ApiCommentResponse[] {
  const author = authorAddress?.toLowerCase();
  if (!author) return [];

  const oldestFirst = rows
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const entries: ApiCommentResponse[] = [];
  for (const row of oldestFirst) {
    if (row.parentId) break;
    if (row.address?.toLowerCase() !== author) break;
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
