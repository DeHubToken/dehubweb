import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { restoreQueryCache, startQueryPersist, clearPersistedQueryCache } from '@/lib/query-persist';

const PERSIST_KEY = 'dehub_rq_cache_v1';

/**
 * Two properties matter here and neither is obvious from the call site.
 *
 * Size: an infinite query holds every page the user scrolled through, and the
 * blob's own 2 MB fallback is to drop everything except the feed — so an
 * untrimmed long scroll quietly costs the profile and post slices their
 * persistence. Only the first page paints, so only the first page is kept.
 *
 * Privacy: the conversation LIST is persisted (that is the point — Messages
 * used to reload from nothing), the threads are not, and sign-out has to remove
 * the blob rather than wait for an idle write that a closing tab never reaches.
 */

function infinite(pages: unknown[]) {
  return { pages, pageParams: pages.map((_, i) => i) };
}

/** Force the debounced writer out now. */
function flush(): void {
  window.dispatchEvent(new Event('pagehide'));
}

function persisted(): { state: { queries: Array<{ queryKey: unknown[]; state: { data: unknown } }> } } | null {
  const raw = localStorage.getItem(PERSIST_KEY);
  return raw ? JSON.parse(raw) : null;
}

function keysOf(): string[] {
  return (persisted()?.state.queries ?? []).map((q) => JSON.stringify(q.queryKey));
}

describe('query-persist', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    localStorage.clear();
    queryClient = new QueryClient();
    startQueryPersist(queryClient);
  });

  it('keeps only the first page of an infinite query', () => {
    queryClient.setQueryData(
      ['unified-feed', {}, 20],
      infinite([{ items: ['a'] }, { items: ['b'] }, { items: ['c'] }]),
    );
    flush();

    const q = persisted()!.state.queries[0];
    const data = q.state.data as { pages: unknown[]; pageParams: unknown[] };
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0]).toEqual({ items: ['a'] });
    expect(data.pageParams).toEqual([0]);
  });

  it('leaves a single-page query untouched', () => {
    queryClient.setQueryData(['unified-feed', {}, 20], infinite([{ items: ['only'] }]));
    flush();
    const data = persisted()!.state.queries[0].state.data as { pages: unknown[] };
    expect(data.pages).toEqual([{ items: ['only'] }]);
  });

  it('persists the conversation list but never the threads', () => {
    queryClient.setQueryData(['messages', 'conversations', '', '0xme'], [{ id: 'c1' }]);
    queryClient.setQueryData(['messages', 'thread', 'c1'], infinite([{ items: ['secret'] }]));
    flush();

    const keys = keysOf();
    expect(keys.some((k) => k.includes('conversations'))).toBe(true);
    expect(keys.some((k) => k.includes('thread'))).toBe(false);
    expect(localStorage.getItem(PERSIST_KEY)).not.toContain('secret');
  });

  it('persists the notification list but not the unread count', () => {
    queryClient.setQueryData(['notifications', 'list', null, null], infinite([{ items: [] }]));
    queryClient.setQueryData(['notifications', 'unreadCount'], 7);
    flush();

    const keys = keysOf();
    expect(keys.some((k) => k.includes('list'))).toBe(true);
    expect(keys.some((k) => k.includes('unreadCount'))).toBe(false);
  });

  it('still ignores roots that were never persistable', () => {
    queryClient.setQueryData(['wallet-balance', '0xme'], { dhb: 1 });
    queryClient.setQueryData(['unified-feed', {}, 20], infinite([{ items: [] }]));
    flush();
    expect(keysOf().some((k) => k.includes('wallet-balance'))).toBe(false);
  });

  it('round-trips through restore', () => {
    queryClient.setQueryData(['messages', 'conversations', '', '0xme'], [{ id: 'c1' }]);
    flush();

    const fresh = new QueryClient();
    restoreQueryCache(fresh);
    expect(fresh.getQueryData(['messages', 'conversations', '', '0xme'])).toEqual([{ id: 'c1' }]);
  });

  it('clearPersistedQueryCache removes the blob outright', () => {
    queryClient.setQueryData(['messages', 'conversations', '', '0xme'], [{ id: 'c1' }]);
    flush();
    expect(localStorage.getItem(PERSIST_KEY)).not.toBeNull();

    clearPersistedQueryCache();
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });

  it('drops a blob older than the 24h window instead of painting it', () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ t: Date.now() - 25 * 60 * 60 * 1000, state: { queries: [], mutations: [] } }),
    );
    const fresh = new QueryClient();
    restoreQueryCache(fresh);
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull();
  });
});
