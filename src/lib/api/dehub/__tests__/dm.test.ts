import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helpers
function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status })
  );
}
function fetchUrl(): string { return vi.mocked(fetch).mock.calls[0][0] as string; }
function fetchOpts() { return vi.mocked(fetch).mock.calls[0][1]; }

beforeEach(() => {
  localStorage.setItem('dehub_token', 'eyJhbGciOiJIUzI1NiJ9.eyJhZGRyZXNzIjoiMHhhYmMxMjMifQ.fake');
  localStorage.setItem('dehub_token_timestamp', String(Date.now()));
  localStorage.setItem('dehub_wallet', '0xabc123');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ── getConversations ──

describe('getConversations', () => {
  it('fetches contacts from JWT-derived address', async () => {
    mockFetch([{ id: 'c1', unreadCount: 0 }]);
    const { getConversations } = await import('@/lib/api/dehub/dm');
    const result = await getConversations(0, 20);
    expect(fetchUrl()).toContain('/api/dm/contacts/');
    expect(result.items).toHaveLength(1);
  });

  it('returns empty when no token', async () => {
    localStorage.clear();
    const { getConversations } = await import('@/lib/api/dehub/dm');
    const result = await getConversations();
    expect(result.items).toEqual([]);
  });

  it('handles result.items format', async () => {
    mockFetch({ result: { items: [{ id: 'c1' }, { id: 'c2' }], hasMore: true } });
    const { getConversations } = await import('@/lib/api/dehub/dm');
    const result = await getConversations(0, 20);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it('handles result array format', async () => {
    mockFetch({ result: [{ id: 'c1' }] });
    const { getConversations } = await import('@/lib/api/dehub/dm');
    const result = await getConversations(0, 20);
    expect(result.items).toHaveLength(1);
  });

  it('uses search endpoint when query provided', async () => {
    mockFetch({ result: { items: [{ id: 'c1' }] } });
    const { getConversations } = await import('@/lib/api/dehub/dm');
    const result = await getConversations(0, 20, 'alice');
    expect(fetchUrl()).toContain('/api/dm/search');
    expect(fetchUrl()).toContain('query=alice');
  });
});

// ── getMessages ──

describe('getMessages', () => {
  it('returns empty for virtual conversations', async () => {
    const spy = mockFetch({});
    const { getMessages } = await import('@/lib/api/dehub/dm');
    const result = await getMessages('new_0xabc');
    expect(result.items).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches messages from correct endpoint', async () => {
    mockFetch({ result: [{ id: 'm1', content: 'hi' }] });
    const { getMessages } = await import('@/lib/api/dehub/dm');
    const result = await getMessages('conv-123', 0, 30);
    expect(fetchUrl()).toContain('/api/dm/messages/conv-123');
    expect(result.items).toHaveLength(1);
  });

  it('handles result.items paginated format', async () => {
    mockFetch({ result: { items: [{ id: 'm1' }], totalCount: 50, hasMore: true } });
    const { getMessages } = await import('@/lib/api/dehub/dm');
    const result = await getMessages('conv-1');
    expect(result.hasMore).toBe(true);
    expect(result.totalCount).toBe(50);
  });
});

// ── sendMessage (now uses socket, tested via use-messages hook) ──

// ── createConversation ──

describe('createConversation', () => {
  it('creates virtual conversation without API call', async () => {
    const spy = mockFetch({});
    const { createConversation } = await import('@/lib/api/dehub/dm');
    const result = await createConversation('0xRecipient', { username: 'bob' });
    expect(result.id).toBe('new_0xRecipient');
    expect(result.otherUser?.username).toBe('bob');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── markConversationAsRead ──

describe('markConversationAsRead', () => {
  it('skips for virtual conversations', async () => {
    const spy = mockFetch({});
    const { markConversationAsRead } = await import('@/lib/api/dehub/dm');
    const result = await markConversationAsRead('new_0xabc');
    expect(result.success).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns success without REST call (read receipts via socket)', async () => {
    const { markConversationAsRead } = await import('@/lib/api/dehub/dm');
    const result = await markConversationAsRead('conv-1');
    expect(result.success).toBe(true);
    // No fetch call — read receipts use socket only per chat-system.md
  });
});

// ── deleteConversation ──

describe('deleteConversation', () => {
  it('calls POST /api/dm/delete-messages', async () => {
    mockFetch({ success: true });
    const { deleteConversation } = await import('@/lib/api/dehub/dm');
    await deleteConversation('conv-1');
    expect(fetchUrl()).toContain('/api/dm/delete-messages');
    const body = JSON.parse(fetchOpts()?.body as string);
    expect(body.conversationId).toBe('conv-1');
  });
});

// ── blockConversation / unblockConversation ──

describe('block/unblock', () => {
  it('blockConversation calls POST /api/dm/block', async () => {
    mockFetch({ success: true });
    const { blockConversation } = await import('@/lib/api/dehub/dm');
    const result = await blockConversation('conv-1');
    expect(fetchUrl()).toContain('/api/dm/block');
    expect(result.success).toBe(true);
  });

  it('unblockConversation calls GET /api/dm/un-block/:id', async () => {
    mockFetch({ success: true });
    const { unblockConversation } = await import('@/lib/api/dehub/dm');
    await unblockConversation('conv-1');
    expect(fetchUrl()).toContain('/api/dm/un-block/conv-1');
    expect(fetchOpts()?.method).toBe('GET');
  });
});

// ── searchUsersForDM ──

describe('searchUsersForDM', () => {
  it('returns empty for short queries', async () => {
    const spy = mockFetch({});
    const { searchUsersForDM } = await import('@/lib/api/dehub/dm');
    const result = await searchUsersForDM('a');
    expect(result.items).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('searches /api/search with accounts type', async () => {
    mockFetch({ result: { accounts: [{ address: '0x1', username: 'alice' }] } });
    const { searchUsersForDM } = await import('@/lib/api/dehub/dm');
    const result = await searchUsersForDM('alice');
    expect(fetchUrl()).toContain('/api/search');
    expect(fetchUrl()).toContain('type=accounts');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].username).toBe('alice');
  });
});

// ── getUserOnlineStatus ──

describe('getUserOnlineStatus', () => {
  it('returns online status', async () => {
    mockFetch({ result: { online: true, lastSeen: '2025-01-01' } });
    const { getUserOnlineStatus } = await import('@/lib/api/dehub/dm');
    const result = await getUserOnlineStatus('0x1');
    expect(result.online).toBe(true);
    expect(result.address).toBe('0x1');
  });

  it('returns offline on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const { getUserOnlineStatus } = await import('@/lib/api/dehub/dm');
    const result = await getUserOnlineStatus('0x1');
    expect(result.online).toBe(false);
  });
});

// ── Group operations (DeHub backend does not support group DMs — 1:1 only) ──

describe('group operations', () => {
  it('createGroup throws clear error (group not supported)', async () => {
    const { createGroup } = await import('@/lib/api/dehub/dm');
    await expect(createGroup('Test Group', ['0x1', '0x2'], 'A group')).rejects.toThrow(
      'Group chat is not supported'
    );
  });

  it('joinGroup throws clear error', async () => {
    const { joinGroup } = await import('@/lib/api/dehub/dm');
    await expect(joinGroup('g1')).rejects.toThrow('Group chat is not supported');
  });

  it('leaveGroup throws clear error', async () => {
    const { leaveGroup } = await import('@/lib/api/dehub/dm');
    await expect(leaveGroup('g1')).rejects.toThrow('Group chat is not supported');
  });
});
