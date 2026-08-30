/**
 * Two rules decide whether a comment list reads as a conversation, and both
 * had failed on production posts.
 *
 * The author-thread block hoisted *every* straight comment the post's author
 * ever left on their own post above the card — so a "thanks" written two
 * minutes after somebody's comment sat above the comment it answered, in a
 * separate block, newer-first. And a reply whose parent had not been paged in
 * yet rendered as a plain top-level comment, which put three identical "👍"
 * replies in a row addressed to nobody.
 */
import { describe, expect, it } from 'vitest';
import { selectAuthorThreadEntries, hasUnresolvedParent } from '@/lib/comment-threading';
import type { ApiCommentResponse } from '@/lib/api/dehub';

const AUTHOR = '0xAuThOr';
const OTHER = '0xother';

function row(over: Partial<ApiCommentResponse> & { id: string; createdAt: string }): ApiCommentResponse {
  return {
    tokenId: 1,
    address: AUTHOR,
    content: '',
    imageUrl: null,
    replyIds: [],
    parentId: null,
    updatedAt: over.createdAt,
    writor: { username: 'someone' },
    ...over,
  } as ApiCommentResponse;
}

describe('author thread entries', () => {
  it('takes the author\'s opening run, whatever order the rows arrive in', () => {
    const rows = [
      row({ id: '3', createdAt: '2026-01-01T00:03:00Z', address: OTHER }),
      row({ id: '1', createdAt: '2026-01-01T00:01:00Z' }),
      row({ id: '2', createdAt: '2026-01-01T00:02:00Z' }),
    ];
    expect(selectAuthorThreadEntries(rows, AUTHOR).map(r => r.id)).toEqual(['1', '2']);
  });

  it('leaves the author out once somebody else has commented', () => {
    // The reported case: early comments, the author says thanks two minutes
    // later. That "thanks" belongs under early's comment, not above the post.
    const rows = [
      row({ id: '1575', createdAt: '2026-08-30T16:22:11Z', address: OTHER }),
      row({ id: '1576', createdAt: '2026-08-30T16:24:54Z' }),
    ];
    expect(selectAuthorThreadEntries(rows, AUTHOR)).toEqual([]);
  });

  it('leaves out an entry somebody replied to, so the reply keeps its parent', () => {
    const rows = [
      row({ id: '1', createdAt: '2026-01-01T00:01:00Z', replyIds: [2] }),
      row({ id: '2', createdAt: '2026-01-01T00:02:00Z', address: OTHER, parentId: 1 }),
    ];
    expect(selectAuthorThreadEntries(rows, AUTHOR)).toEqual([]);
  });

  it('stops at the author\'s own first reply rather than skipping past it', () => {
    const rows = [
      row({ id: '1', createdAt: '2026-01-01T00:01:00Z' }),
      row({ id: '2', createdAt: '2026-01-01T00:02:00Z', address: OTHER }),
      row({ id: '3', createdAt: '2026-01-01T00:03:00Z', parentId: 2 }),
      row({ id: '4', createdAt: '2026-01-01T00:04:00Z' }),
    ];
    expect(selectAuthorThreadEntries(rows, AUTHOR).map(r => r.id)).toEqual(['1']);
  });

  it('needs an author to have a thread at all', () => {
    const rows = [row({ id: '1', createdAt: '2026-01-01T00:01:00Z' })];
    expect(selectAuthorThreadEntries(rows, undefined)).toEqual([]);
  });
});

describe('unresolved parents', () => {
  it('spots a reply whose parent is on a page that has not loaded', () => {
    // Post 61, page 0: uncle's "👍" answers comment 64, which is on page 2.
    const rows = [
      row({ id: '93', createdAt: '2023-01-01T00:00:00Z', parentId: 64 }),
      row({ id: '98', createdAt: '2023-01-01T00:00:00Z' }),
    ];
    expect(hasUnresolvedParent(rows)).toBe(true);
  });

  it('is satisfied once the parent is in the window', () => {
    const rows = [
      row({ id: '703', createdAt: '2023-01-01T00:01:00Z', parentId: 702 }),
      row({ id: '702', createdAt: '2023-01-01T00:00:00Z', replyIds: [703] }),
    ];
    expect(hasUnresolvedParent(rows)).toBe(false);
  });

  it('does not chase a parent for a top-level comment', () => {
    expect(hasUnresolvedParent([row({ id: '1', createdAt: '2026-01-01T00:00:00Z' })])).toBe(false);
  });
});
