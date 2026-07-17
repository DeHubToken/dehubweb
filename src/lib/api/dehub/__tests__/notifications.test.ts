import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status })
  );
}
function fetchUrl(): string { return vi.mocked(fetch).mock.calls[0][0] as string; }
function fetchOpts() { return vi.mocked(fetch).mock.calls[0][1]; }

beforeEach(() => {
  localStorage.setItem('dehub_token', 'test-jwt');
  localStorage.setItem('dehub_token_timestamp', String(Date.now()));
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ── getNotifications ──

describe('getNotifications', () => {
  it('normalizes wrapped result array', async () => {
    mockFetch({
      result: [
        { _id: 'n1', type: 'like', category: 'engagement', content: 'liked', read: false, createdAt: '2025-01-01', updatedAt: '2025-01-01', address: '0x1', actorUsername: 'alice', actorAddress: '0xactor' },
        { _id: 'n2', type: 'comment', category: 'engagement', content: 'commented', read: true, createdAt: '2025-01-01', updatedAt: '2025-01-01', address: '0x1' },
      ],
    });
    const { getNotifications } = await import('@/lib/api/dehub/notifications');
    const result = await getNotifications(1, 30);

    expect(fetchUrl()).toContain('/api/notification');
    expect(result.items).toHaveLength(2);
    // Verify normalization adds `id` from `_id`
    expect(result.items[0].id).toBe('n1');
    // Verify actor enrichment
    expect(result.items[0].actor?.username).toBe('alice');
    expect(result.items[0].actor?.address).toBe('0xactor');
    // Second item has no actor fields → actor should be undefined
    expect(result.items[1].actor).toBeUndefined();
  });

  it('normalizes flat array response', async () => {
    mockFetch([
      { _id: 'n1', type: 'tip', category: 'monetization', content: 'tipped', read: false, createdAt: '2025-01-01', updatedAt: '2025-01-01', address: '0x1', tokenId: 42, tokenTitle: 'My Post' },
    ]);
    const { getNotifications } = await import('@/lib/api/dehub/notifications');
    const result = await getNotifications();

    expect(result.items).toHaveLength(1);
    // Verify post enrichment from tokenId
    expect(result.items[0].post?.tokenId).toBe(42);
    expect(result.items[0].post?.title).toBe('My Post');
  });

  it('filters out items without _id', async () => {
    mockFetch({ result: [{ _id: 'n1', type: 'like', category: 'engagement', content: 'x', read: false, createdAt: '', updatedAt: '', address: '' }, null, { type: 'like' }] });
    const { getNotifications } = await import('@/lib/api/dehub/notifications');
    const result = await getNotifications();
    expect(result.items).toHaveLength(1);
  });

  it('returns empty for unknown response shape', async () => {
    mockFetch({ something: 'else' });
    const { getNotifications } = await import('@/lib/api/dehub/notifications');
    const result = await getNotifications();
    expect(result.items).toEqual([]);
  });

  it('passes category and unreadOnly params', async () => {
    mockFetch({ result: [] });
    const { getNotifications } = await import('@/lib/api/dehub/notifications');
    await getNotifications(1, 10, 'social', true);
    const url = fetchUrl();
    expect(url).toContain('category=social');
    expect(url).toContain('unreadOnly=true');
  });

  it('computes hasMore based on limit', async () => {
    // Exactly `limit` items → hasMore=true
    const items = Array.from({ length: 5 }, (_, i) => ({
      _id: `n${i}`, type: 'like', category: 'engagement', content: '', read: false, createdAt: '', updatedAt: '', address: '',
    }));
    mockFetch({ result: items });
    const { getNotifications } = await import('@/lib/api/dehub/notifications');
    const result = await getNotifications(1, 5);
    expect(result.hasMore).toBe(true);
  });
});

// ── getUnreadNotificationCount ──

describe('getUnreadNotificationCount', () => {
  it('returns count with categories', async () => {
    mockFetch({ total: 7, byCategory: { engagement: 3, social: 2, monetization: 1, content: 1, system: 0 } });
    const { getUnreadNotificationCount } = await import('@/lib/api/dehub/notifications');
    const result = await getUnreadNotificationCount();
    expect(result.total).toBe(7);
    expect(result.byCategory.engagement).toBe(3);
  });

  it('defaults to zeros when response is sparse', async () => {
    mockFetch({});
    const { getUnreadNotificationCount } = await import('@/lib/api/dehub/notifications');
    const result = await getUnreadNotificationCount();
    expect(result.total).toBe(0);
    expect(result.byCategory.social).toBe(0);
  });
});

// ── markNotificationAsRead ──

describe('markNotificationAsRead', () => {
  it('calls PATCH /api/notification/:id', async () => {
    mockFetch({ message: 'ok' });
    const { markNotificationAsRead } = await import('@/lib/api/dehub/notifications');
    await markNotificationAsRead('n1');
    expect(fetchUrl()).toContain('/api/notification/n1');
    expect(fetchOpts()?.method).toBe('PATCH');
  });
});

// ── markAllNotificationsAsRead ──

describe('markAllNotificationsAsRead', () => {
  it('calls POST /api/notification/mark-all-read', async () => {
    mockFetch({ message: 'done', count: 5 });
    const { markAllNotificationsAsRead } = await import('@/lib/api/dehub/notifications');
    const result = await markAllNotificationsAsRead();
    expect(fetchUrl()).toContain('/api/notification/mark-all-read');
    expect(fetchOpts()?.method).toBe('POST');
    expect(result.count).toBe(5);
  });

  it('passes category param when specified', async () => {
    mockFetch({ message: 'done', count: 2 });
    const { markAllNotificationsAsRead } = await import('@/lib/api/dehub/notifications');
    await markAllNotificationsAsRead('engagement');
    expect(fetchUrl()).toContain('category=engagement');
  });
});

// ── Auth requirement ──

describe('auth requirement', () => {
  it('getNotifications throws without token', async () => {
    localStorage.clear();
    mockFetch({});
    const { getNotifications } = await import('@/lib/api/dehub/notifications');
    await expect(getNotifications()).rejects.toThrow('Authentication required');
  });
});
