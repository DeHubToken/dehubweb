import { describe, expect, it } from 'vitest';
import { isVideoAccessExpiring, videoNeedsAccess } from '../video-access';

describe('videoNeedsAccess', () => {
  it('asks for a signed URL behind every gate', () => {
    expect(videoNeedsAccess({ isPPV: true })).toBe(true);
    expect(videoNeedsAccess({ isLocked: true, lockedPrice: 100 })).toBe(true);
    expect(videoNeedsAccess({ subscriberPlans: [{ id: '1' }] })).toBe(true);
  });

  it('plays an open post straight from the CDN', () => {
    expect(videoNeedsAccess({})).toBe(false);
    // A hold toggle with no amount is no gate at all.
    expect(videoNeedsAccess({ isLocked: true, lockedPrice: 0 })).toBe(false);
    expect(videoNeedsAccess({ subscriberPlans: [] })).toBe(false);
  });
});

describe('isVideoAccessExpiring', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  it('only blames the signature when it is about to lapse', () => {
    expect(isVideoAccessExpiring({ url: 'x', private: true, expiresAt: '2026-10-23T12:05:00Z' }, now)).toBe(true);
    expect(isVideoAccessExpiring({ url: 'x', private: true, expiresAt: '2026-10-23T11:00:00Z' }, now)).toBe(true);
    expect(isVideoAccessExpiring({ url: 'x', private: true, expiresAt: '2026-10-23T18:00:00Z' }, now)).toBe(false);
    expect(isVideoAccessExpiring({ url: 'x', private: false, expiresAt: null }, now)).toBe(false);
  });
});
