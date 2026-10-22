/**
 * The streamer invite an affiliate copies from the agency kit has to land on
 * /stream with the visit attributed: ReferralLanding reads `?to=` through
 * resolveDeepLinkTarget, and /stream must be a real route, not a profile.
 */
import { describe, expect, it } from 'vitest';
import { resolveDeepLinkTarget } from '@/lib/affiliateDeepLink';
import { ROUTE_SEGMENTS } from '@/lib/reserved-usernames';
import { STREAM_PAGE, streamerInviteLink } from '@/lib/streamer-page.js';

describe('streamer invite link', () => {
  it('builds /r/<CODE>?to=/stream', () => {
    expect(streamerInviteLink('https://dehub.io/', 'ABC123')).toBe('https://dehub.io/r/ABC123?to=/stream');
  });

  it('deep-links the referral landing to /stream', () => {
    const url = new URL(streamerInviteLink('https://dehub.io', 'ABC123'));
    expect(resolveDeepLinkTarget(undefined, url.search)).toBe(STREAM_PAGE.path);
    expect(resolveDeepLinkTarget('stream', '')).toBe(STREAM_PAGE.path);
  });

  it('keeps /stream out of the username space', () => {
    expect(ROUTE_SEGMENTS).toContain('stream');
  });

  it('asks the FAQ every question the page answers', () => {
    expect(STREAM_PAGE.faq.length).toBeGreaterThanOrEqual(3);
    for (const { q, a } of STREAM_PAGE.faq) {
      expect(q.endsWith('?')).toBe(true);
      expect(a.length).toBeGreaterThan(40);
    }
  });
});
