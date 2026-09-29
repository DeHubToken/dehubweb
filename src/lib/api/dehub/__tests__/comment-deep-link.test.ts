import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * The comments fetch behind a comment notification.
 *
 * The id has to reach the API as `commentId` — that is what makes the server
 * pin the linked comment to the top of page 0 and backfill its ancestors, so
 * the row is in the first response instead of twelve pages down a busy thread.
 * And the placeholder the server returns for a comment that has since been
 * deleted has no author and no text, so it must never reach the list.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status })
  );
}

function fetchUrl(): string {
  return vi.mocked(fetch).mock.calls[0][0] as string;
}

const comment = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  tokenId: 1,
  address: '0xabc',
  content: 'hello',
  imageUrl: null,
  replyIds: [],
  parentId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  writor: { username: 'someone' },
  ...extra,
});

describe('getNFTComments', () => {
  it('sends commentId so the linked comment is pinned to page 0', async () => {
    mockFetch({ result: { items: [comment('55')], totalCount: 1, skip: 0, limit: 20, hasMore: false } });
    const { getNFTComments } = await import('@/lib/api/dehub/comments');

    await getNFTComments('1', 0, 20, '0xviewer', '55');

    const url = fetchUrl();
    expect(url).toContain('/api/nft/1/comments');
    expect(url).toContain('commentId=55');
  });

  it('omits commentId entirely when there is no deep link', async () => {
    mockFetch({ result: { items: [], totalCount: 0, skip: 0, limit: 20, hasMore: false } });
    const { getNFTComments } = await import('@/lib/api/dehub/comments');

    await getNFTComments('1', 0, 20, '0xviewer');

    expect(fetchUrl()).not.toContain('commentId');
  });

  it('drops the placeholder for a comment that no longer exists', async () => {
    mockFetch({
      result: {
        items: [
          { id: '55', tokenId: 1, content: null, address: null, notFound: true },
          comment('54'),
        ],
        totalCount: 1,
        skip: 0,
        limit: 20,
        hasMore: false,
      },
    });
    const { getNFTComments } = await import('@/lib/api/dehub/comments');

    const items = await getNFTComments('1', 0, 20, undefined, '55');

    expect(items.map(c => c.id)).toEqual(['54']);
  });
});

describe('getNFTCommentPage', () => {
  it("takes the server's hasMore, not the row count, after dropping a placeholder", async () => {
    // A full page of two whose first row is a deleted linked comment: one row
    // survives, which a length check would read as the last page.
    mockFetch({
      result: {
        items: [{ id: '55', tokenId: 1, content: null, address: null, notFound: true }, comment('54')],
        totalCount: 40,
        skip: 0,
        limit: 2,
        hasMore: true,
      },
    });
    const { getNFTCommentPage } = await import('@/lib/api/dehub/comments');

    const page = await getNFTCommentPage('1', 0, 2, undefined, '55');

    expect(page.items.map(c => c.id)).toEqual(['54']);
    expect(page.hasMore).toBe(true);
  });

  it('sends topTipped on later pages too, since the server sorts by it on every page', async () => {
    mockFetch({ result: { items: [], totalCount: 0, skip: 20, limit: 20, hasMore: false } });
    const { getNFTCommentPage } = await import('@/lib/api/dehub/comments');

    await getNFTCommentPage('1', 1, 20, undefined, undefined, ['9', '8']);

    expect(decodeURIComponent(fetchUrl())).toContain('topTipped=9,8');
  });
});
