import { describe, expect, it } from 'vitest';
import { isAnonymousFeedResponse } from '@/lib/feed-response-auth';

describe('feed response authentication', () => {
  it('does not refresh an authenticated count response just because viewer flags are absent', () => {
    expect(isAnonymousFeedResponse({ signal: true, authenticated: true, result: [{ tokenId: 1, totalViews: 4 }] })).toBe(false);
  });
  it('recovers an expired session even when its compact result is empty', () => {
    expect(isAnonymousFeedResponse({ signal: true, authenticated: false, result: [] })).toBe(true);
  });
  it('keeps ordinary feed and older-server recovery behavior', () => {
    expect(isAnonymousFeedResponse({ result: [{ tokenId: 1 }] })).toBe(true);
    expect(isAnonymousFeedResponse({ result: [{ tokenId: 1, isLiked: false }] })).toBe(false);
    expect(isAnonymousFeedResponse({ result: [] })).toBe(false);
  });
});
