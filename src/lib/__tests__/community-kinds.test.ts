import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/dhb-payment', () => ({ payDhb: vi.fn() }));
vi.mock('@/hooks/use-community-admin', () => ({ callRpc: vi.fn() }));
import { chatsFromMemberships, communityKindOf, entryPriceOf } from '@/lib/community-kinds';

describe('community kinds', () => {
  it('reads the kind, defaulting to a community', () => {
    expect(communityKindOf({ kind: 'group' } as any)).toBe('group');
    expect(communityKindOf({ kind: 'channel' } as any)).toBe('channel');
    expect(communityKindOf({ kind: 'forum' } as any)).toBe('community');
    expect(communityKindOf(null)).toBe('community');
  });

  it('reads the entry price as whole tokens', () => {
    expect(entryPriceOf({ entry_price: '1000' } as any)).toBe(1000);
    expect(entryPriceOf({ entry_price: 2.2 } as any)).toBe(3);
    expect(entryPriceOf({ entry_price: 0 } as any)).toBe(0);
    expect(entryPriceOf({ entry_price: null } as any)).toBe(0);
  });

  it('lists only groups and channels, newest first', () => {
    const rows = [
      { communities: { id: 'a', kind: 'community', created_at: '2026-11-03' } },
      { communities: { id: 'b', kind: 'group', created_at: '2026-11-01' } },
      { communities: { id: 'c', kind: 'channel', created_at: '2026-11-02' } },
      { communities: null },
    ] as any;
    expect(chatsFromMemberships(rows).map(c => c.id)).toEqual(['c', 'b']);
  });
});
