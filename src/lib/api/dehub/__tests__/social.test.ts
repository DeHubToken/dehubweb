import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEHUB_API_BASE } from '@/lib/api/dehub/core';

// Set up a fake auth token before importing the modules under test
beforeEach(() => {
  localStorage.setItem('dehub_token', 'test-jwt-token');
  localStorage.setItem('dehub_token_timestamp', String(Date.now()));
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// Helper to mock a successful fetch response
function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status })
  );
}

// Helper to get the URL string from the first fetch call
function fetchUrl(): string {
  return vi.mocked(fetch).mock.calls[0][0] as string;
}

function fetchOpts() {
  return vi.mocked(fetch).mock.calls[0][1];
}

// ──────────────────────────────────────────────
// followUser / unfollowUser
// ──────────────────────────────────────────────

describe('followUser', () => {
  it('calls GET /api/request_follow with following param', async () => {
    mockFetch({ result: true });
    const { followUser } = await import('@/lib/api/dehub/social');

    const result = await followUser('0xabc');
    
    const url = fetchUrl();
    expect(url).toContain('/api/request_follow');
    expect(url).toContain('following=0xabc');
    expect(fetchOpts()?.method).toBe('GET');
    expect(result).toEqual({ result: true });
  });
});

describe('unfollowUser', () => {
  it('includes unFollowing=true param', async () => {
    mockFetch({ result: true });
    const { unfollowUser } = await import('@/lib/api/dehub/social');

    await unfollowUser('0xdef');
    
    const url = fetchUrl();
    expect(url).toContain('following=0xdef');
    expect(url).toContain('unFollowing=true');
  });
});

// ──────────────────────────────────────────────
// isFollowing
// ──────────────────────────────────────────────

describe('isFollowing', () => {
  it('returns true when API responds with nested isFollowing', async () => {
    mockFetch({ result: { isFollowing: true } });
    const { isFollowing } = await import('@/lib/api/dehub/social');

    const result = await isFollowing('0x123');
    
    expect(result).toBe(true);
    expect(fetchUrl()).toContain('target=0x123');
  });

  it('returns false when API responds with flat result', async () => {
    mockFetch({ result: false });
    const { isFollowing } = await import('@/lib/api/dehub/social');

    const result = await isFollowing('0x456');
    expect(result).toBe(false);
  });
});

// ──────────────────────────────────────────────
// voteOnPost
// ──────────────────────────────────────────────

describe('voteOnPost', () => {
  it('sends streamTokenId and vote=true for like', async () => {
    const voteResult = { success: true, tokenId: 42, voteType: 'for' as const };
    mockFetch({ result: voteResult });
    const { voteOnPost } = await import('@/lib/api/dehub/social');

    const result = await voteOnPost({ tokenId: 42, voteType: 'for' });
    
    expect(fetchOpts()?.method).toBe('POST');
    const body = JSON.parse(fetchOpts()?.body as string);
    expect(body.streamTokenId).toBe(42);
    expect(body.vote).toBe(true);
    expect(result).toEqual(voteResult);
  });

  it('sends vote=false for dislike', async () => {
    mockFetch({ result: { success: true, tokenId: 7, voteType: 'against' } });
    const { voteOnPost } = await import('@/lib/api/dehub/social');

    await voteOnPost({ tokenId: 7, voteType: 'against' });
    
    const body = JSON.parse(fetchOpts()?.body as string);
    expect(body.vote).toBe(false);
  });

  it('unwraps non-wrapped response', async () => {
    const flat = { success: true, tokenId: 1, voteType: null };
    mockFetch(flat);
    const { voteOnPost } = await import('@/lib/api/dehub/social');

    const result = await voteOnPost({ tokenId: 1, voteType: 'for' });
    expect(result).toEqual(flat);
  });
});

// ──────────────────────────────────────────────
// toggleFollow
// ──────────────────────────────────────────────

describe('toggleFollow', () => {
  it('sends POST with lowercased address', async () => {
    mockFetch({ result: { success: true, isFollowing: true } });
    const { toggleFollow } = await import('@/lib/api/dehub/social');

    const result = await toggleFollow({ targetAddress: '0xABC' });
    
    const body = JSON.parse(fetchOpts()?.body as string);
    expect(body.address).toBe('0xabc');
    expect(result.isFollowing).toBe(true);
  });
});

// ──────────────────────────────────────────────
// toggleCommentLike
// ──────────────────────────────────────────────

describe('toggleCommentLike', () => {
  it('sends commentId in body', async () => {
    mockFetch({ result: { success: true, commentId: 'c1', isLiked: true, likeCount: 5 } });
    const { toggleCommentLike } = await import('@/lib/api/dehub/social');

    const result = await toggleCommentLike({ commentId: 'c1' });
    
    const body = JSON.parse(fetchOpts()?.body as string);
    expect(body.commentId).toBe('c1');
    expect(result.isLiked).toBe(true);
    expect(result.likeCount).toBe(5);
  });
});

// ──────────────────────────────────────────────
// getFollowList — data normalization
// ──────────────────────────────────────────────

describe('getFollowList', () => {
  it('normalizes paginated object response', async () => {
    mockFetch({
      result: {
        items: [
          { user: { address: '0x1', username: 'alice' } },
          { user: { address: '0x2', username: 'bob' } },
        ],
        pagination: { page: 1, limit: 20, totalCount: 2, totalPages: 1, hasMore: false },
      },
    });
    const { getFollowList } = await import('@/lib/api/dehub/social');

    const result = await getFollowList('0xowner', 'followers', { page: 1, limit: 20 });
    
    expect(result.items).toHaveLength(2);
    expect(result.items[0].username).toBe('alice');
    expect(result.pagination?.totalCount).toBe(2);
  });

  it('normalizes raw wallet address strings', async () => {
    mockFetch({ result: ['0xAAA', '0xBBB'] });
    const { getFollowList } = await import('@/lib/api/dehub/social');

    const result = await getFollowList('0xowner', 'following');
    
    expect(result.items).toHaveLength(2);
    expect(result.items[0].address).toBe('0xaaa');
    expect(result.items[1].address).toBe('0xbbb');
  });

  it('returns empty items for unexpected shape', async () => {
    mockFetch({ result: 'unexpected' });
    const { getFollowList } = await import('@/lib/api/dehub/social');

    const result = await getFollowList('0xowner', 'followers');
    expect(result.items).toEqual([]);
  });

  it('passes search param in query string', async () => {
    mockFetch({ result: { items: [], pagination: null } });
    const { getFollowList } = await import('@/lib/api/dehub/social');

    await getFollowList('0xowner', 'followers', { search: 'alice' });
    
    expect(fetchUrl()).toContain('search=alice');
  });
});

// ──────────────────────────────────────────────
// Follow request management
// ──────────────────────────────────────────────

describe('follow request management', () => {
  it('getFollowRequests unwraps result array', async () => {
    const items = [{ id: 'r1', address: '0x1' }];
    mockFetch({ result: items });
    const { getFollowRequests } = await import('@/lib/api/dehub/social');

    const result = await getFollowRequests();
    expect(result).toEqual(items);
  });

  it('approveFollowRequest calls correct endpoint', async () => {
    mockFetch({ result: true });
    const { approveFollowRequest } = await import('@/lib/api/dehub/social');

    await approveFollowRequest('req-123');
    
    expect(fetchUrl()).toContain('/api/follow-requests/req-123/accept');
    expect(fetchOpts()?.method).toBe('POST');
  });

  it('rejectFollowRequest calls correct endpoint', async () => {
    mockFetch({ result: true });
    const { rejectFollowRequest } = await import('@/lib/api/dehub/social');

    await rejectFollowRequest('req-456');
    expect(fetchUrl()).toContain('/api/follow-requests/req-456/reject');
  });

  it('acceptAllFollowRequests calls bulk endpoint', async () => {
    mockFetch({ result: true });
    const { acceptAllFollowRequests } = await import('@/lib/api/dehub/social');

    await acceptAllFollowRequests();
    expect(fetchUrl()).toContain('/api/follow-requests/accept-all');
  });

  it('rejectAllFollowRequests calls bulk endpoint', async () => {
    mockFetch({ result: true });
    const { rejectAllFollowRequests } = await import('@/lib/api/dehub/social');

    await rejectAllFollowRequests();
    expect(fetchUrl()).toContain('/api/follow-requests/reject-all');
  });
});

// ──────────────────────────────────────────────
// Auth requirement — all social endpoints need token
// ──────────────────────────────────────────────

describe('auth requirement', () => {
  it('followUser throws when no token', async () => {
    localStorage.clear();
    mockFetch({});
    const { followUser } = await import('@/lib/api/dehub/social');

    await expect(followUser('0x1')).rejects.toThrow('Authentication required');
  });

  it('voteOnPost throws when no token', async () => {
    localStorage.clear();
    mockFetch({});
    const { voteOnPost } = await import('@/lib/api/dehub/social');

    await expect(voteOnPost({ tokenId: 1, voteType: 'for' })).rejects.toThrow('Authentication required');
  });
});
