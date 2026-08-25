import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readDraft,
  writeDraft,
  clearDraft,
  hasDraft,
  flushDrafts,
  subscribeDrafts,
  __resetDraftCacheForTests,
} from '@/lib/draft-cache';
import { conversationIdentity, conversationPeerAddress } from '@/lib/conversation-identity';
import type { DeHubConversation } from '@/lib/api/dehub';

const STORAGE_KEY = 'dehub-drafts-v1';

/**
 * The bug these exist for: a DM you have never sent before is born with a
 * client-side id ("new_0x…") and swaps to a real ObjectId seconds later. Every
 * cache keyed on that id silently resets at the swap. So the two things worth
 * pinning are (a) the identity is the PEER, not the id, and (b) a draft written
 * before the swap is still readable after it.
 */

function conv(overrides: Partial<DeHubConversation>): DeHubConversation {
  return {
    id: 'x',
    participants: [],
    unreadCount: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as DeHubConversation;
}

const PEER = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';

describe('conversationIdentity', () => {
  it('is the same before and after the virtual id becomes a real one', () => {
    const virtual = conv({ id: `new_${PEER}`, otherUser: { address: PEER } as never });
    const real = conv({ id: '66b1f0c3e4b0a1f2d3c4b5a6', otherUser: { address: PEER } as never });
    expect(conversationIdentity(virtual)).toBe(conversationIdentity(real));
  });

  it('recovers the peer from a virtual id when participants have not loaded', () => {
    expect(conversationPeerAddress(conv({ id: `new_${PEER}` }))).toBe(PEER.toLowerCase());
    expect(conversationPeerAddress(conv({ id: PEER }))).toBe(PEER.toLowerCase());
  });

  it('is case-insensitive on the address — checksummed and lowercase agree', () => {
    const a = conv({ id: 'a', otherUser: { address: PEER } as never });
    const b = conv({ id: 'b', otherUser: { address: PEER.toLowerCase() } as never });
    expect(conversationIdentity(a)).toBe(conversationIdentity(b));
  });

  it('keeps groups on their own id and never collides with a DM', () => {
    const group = conv({ id: 'grp1', isGroup: true });
    expect(conversationIdentity(group)).toBe('group:grp1');
    expect(conversationIdentity(group)).not.toBe(conversationIdentity(conv({ id: 'grp1' })));
  });
});

describe('draft-cache', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetDraftCacheForTests();
  });

  it('reads back what it wrote, in the same tick', () => {
    writeDraft('dm:0xabc', 'half a sentence');
    expect(readDraft('dm:0xabc')).toBe('half a sentence');
    expect(hasDraft('dm:0xabc')).toBe(true);
  });

  it('survives a reload — flush, drop the mirror, read from storage', () => {
    writeDraft('dm:0xabc', 'still here');
    flushDrafts();
    __resetDraftCacheForTests();
    expect(readDraft('dm:0xabc')).toBe('still here');
  });

  it('a draft written under a virtual conversation is found under the real one', () => {
    const virtual = conv({ id: `new_${PEER}`, otherUser: { address: PEER } as never });
    writeDraft(conversationIdentity(virtual), 'typed before the server caught up');
    flushDrafts();
    __resetDraftCacheForTests();

    const real = conv({ id: '66b1f0c3e4b0a1f2d3c4b5a6', otherUser: { address: PEER } as never });
    expect(readDraft(conversationIdentity(real))).toBe('typed before the server caught up');
  });

  it('treats whitespace-only as no draft, and clears an existing one', () => {
    writeDraft('dm:0xabc', 'something');
    writeDraft('dm:0xabc', '   \n ');
    expect(readDraft('dm:0xabc')).toBe('');
    expect(hasDraft('dm:0xabc')).toBe(false);
  });

  it('clearDraft removes it from storage, not just from memory', () => {
    writeDraft('dm:0xabc', 'sent this one');
    flushDrafts();
    clearDraft('dm:0xabc');
    flushDrafts();
    __resetDraftCacheForTests();
    expect(readDraft('dm:0xabc')).toBe('');
  });

  it('keeps drafts apart by scope', () => {
    writeDraft('dm:0xaaa', 'to A');
    writeDraft('dm:0xbbb', 'to B');
    expect(readDraft('dm:0xaaa')).toBe('to A');
    expect(readDraft('dm:0xbbb')).toBe('to B');
  });

  it('ignores an empty key rather than storing under ""', () => {
    writeDraft('', 'nowhere');
    expect(readDraft('')).toBe('');
    flushDrafts();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('forgets drafts older than the 30-day window', () => {
    const ancient = Date.now() - 31 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, w: ancient, d: { 'dm:0xold': { t: 'last month', u: ancient } } }),
    );
    __resetDraftCacheForTests();
    expect(readDraft('dm:0xold')).toBe('');
  });

  it('shrugs off a corrupt or foreign blob instead of throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    __resetDraftCacheForTests();
    expect(() => readDraft('dm:0xabc')).not.toThrow();
    expect(readDraft('dm:0xabc')).toBe('');

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 99, d: { 'dm:0xabc': { t: 'x', u: 1 } } }));
    __resetDraftCacheForTests();
    expect(readDraft('dm:0xabc')).toBe('');
  });

  it('notifies subscribers so the conversation list can show the draft', () => {
    const seen = vi.fn();
    const unsubscribe = subscribeDrafts(seen);
    writeDraft('dm:0xabc', 'typing');
    expect(seen).toHaveBeenCalled();
    unsubscribe();
    seen.mockClear();
    writeDraft('dm:0xabc', 'typing more');
    expect(seen).not.toHaveBeenCalled();
  });

  it('does not re-notify when the text has not actually changed', () => {
    writeDraft('dm:0xabc', 'same');
    const seen = vi.fn();
    subscribeDrafts(seen);
    writeDraft('dm:0xabc', 'same');
    expect(seen).not.toHaveBeenCalled();
  });

  it('caps a single draft so one runaway paste cannot eat the quota', () => {
    writeDraft('dm:0xabc', 'a'.repeat(50_000));
    expect(readDraft('dm:0xabc').length).toBe(20_000);
  });

  it('keeps only the newest 120 scopes', () => {
    for (let i = 0; i < 130; i++) writeDraft(`dm:0x${i}`, `draft ${i}`);
    flushDrafts();
    __resetDraftCacheForTests();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as { d: Record<string, unknown> };
    expect(Object.keys(stored.d).length).toBe(120);
    // The most recent write is always among the survivors.
    expect(readDraft('dm:0x129')).toBe('draft 129');
  });
});
