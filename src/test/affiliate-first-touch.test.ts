import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/connection-source', () => ({ readLastSession: () => null }));
import { getAffiliateRef, getAffiliateSubRef, setAffiliateRef } from '../lib/affiliateRef';

beforeEach(() => {
  for (const name of ['dehub_aff_ref', 'dehub_aff_sub']) document.cookie = `${name}=; max-age=0; path=/`;
});

describe('first-touch outreach attribution', () => {
  it('keeps the original parent and tag together across later links', () => {
    setAffiliateRef('PARENT', 'john');
    setAffiliateRef('OTHER', 'sarah');
    expect(getAffiliateRef()).toBe('PARENT');
    expect(getAffiliateSubRef()).toBe('john');
  });
  it('does not add a later tag to an existing untagged first touch', () => {
    setAffiliateRef('PARENT');
    setAffiliateRef('PARENT', 'john');
    expect(getAffiliateSubRef()).toBeNull();
  });
  it('rejects a stale tag whose parent differs from the current cookie', () => {
    setAffiliateRef('PARENT', 'john');
    document.cookie = 'dehub_aff_ref=OTHER; path=/';
    expect(getAffiliateSubRef()).toBeNull();
  });
});
