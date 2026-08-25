/**
 * `dehub.io/mal.eth` has to be a profile, and `dehub.io/favicon.ico` must not.
 *
 * The edge worker decided both with the same test — "does the first segment
 * contain a dot?" — in four separate places, which is why a `.eth` handle
 * unfurled as the homepage while the same account at `/mal` rendered a proper
 * card. Measured against production before this changed:
 *
 *   GET /mal      as Googlebot  →  <title>@mal on DeHub …</title>
 *   GET /mal.eth  as Googlebot  →  <title>DeHub — Open Source …</title>
 *
 * The carve-out is deliberately narrow — `.eth` and nothing else — because the
 * dot test is load-bearing for every real static asset. These tests pin both
 * halves: the new namespace resolves, and no other extension moved.
 */

import { describe, expect, it } from 'vitest';
import {
  couldBeProfileSegment,
  firstSegmentOf,
  isEnsHandle,
} from '../../CLOUDFLARE_WORKER_SEO.js';
import { ROUTE_SEGMENTS } from '@/lib/reserved-usernames';

const SYSTEM_ROUTES = new Set(ROUTE_SEGMENTS.map(s => s.toLowerCase()));

describe('isEnsHandle', () => {
  it('accepts a .eth name', () => {
    expect(isEnsHandle('mal.eth')).toBe(true);
    expect(isEnsHandle('MAL.ETH')).toBe(true);
    // Subdomains are real ENS names and resolve like any other.
    expect(isEnsHandle('sub.mal.eth')).toBe(true);
  });

  it('accepts a percent-encoded name', () => {
    // ENS names may be non-ASCII, and by the time one reaches the worker it is
    // percent-encoded. A charset regex here would reject exactly the names
    // that most need the SSR path.
    expect(isEnsHandle('%d9%85%d8%b1%d8%ad%d8%a8%d8%a7.eth')).toBe(true);
  });

  it('rejects the bare suffix and anything shorter', () => {
    expect(isEnsHandle('.eth')).toBe(false);
    expect(isEnsHandle('eth')).toBe(false);
    expect(isEnsHandle('')).toBe(false);
  });

  it('rejects every other extension', () => {
    // The whole risk of this change is widening the static-asset skip, so the
    // things that must still short-circuit are named explicitly.
    for (const asset of [
      'favicon.ico',
      'robots.txt',
      'sitemap.xml',
      'manifest.webmanifest',
      'dehub.apk',
      'og-image.png',
      'index.html',
      'sw.js',
      'dehub.io',
      'name.ethx',
      'name.eth.png',
    ]) {
      expect(isEnsHandle(asset), asset).toBe(false);
    }
  });
});

describe('firstSegmentOf', () => {
  it('takes the first segment, lowercased, without a leading @', () => {
    expect(firstSegmentOf('/mal.eth')).toBe('mal.eth');
    expect(firstSegmentOf('/@Mal.ETH')).toBe('mal.eth');
    expect(firstSegmentOf('/mal.eth/posts')).toBe('mal.eth');
    expect(firstSegmentOf('/')).toBe('');
  });
});

describe('couldBeProfileSegment', () => {
  it('treats a .eth handle as a profile', () => {
    expect(couldBeProfileSegment('mal.eth', SYSTEM_ROUTES)).toBe(true);
  });

  it('still treats an ordinary username as a profile', () => {
    expect(couldBeProfileSegment('mal', SYSTEM_ROUTES)).toBe(true);
    expect(couldBeProfileSegment('sableraven_9847', SYSTEM_ROUTES)).toBe(true);
  });

  it('still refuses static assets', () => {
    expect(couldBeProfileSegment('favicon.ico', SYSTEM_ROUTES)).toBe(false);
    expect(couldBeProfileSegment('sitemap.xml', SYSTEM_ROUTES)).toBe(false);
  });

  it('still refuses real routes', () => {
    // Including the ones squatted by real accounts — linking those as profiles
    // is what the reserved-usernames list exists to prevent.
    expect(couldBeProfileSegment('explore', SYSTEM_ROUTES)).toBe(false);
    expect(couldBeProfileSegment('usernames', SYSTEM_ROUTES)).toBe(false);
    expect(couldBeProfileSegment('', SYSTEM_ROUTES)).toBe(false);
  });

  it('cannot be fooled by a route name wearing a suffix', () => {
    // `explore.eth` is a different string from `explore`, so it is not a route
    // and IS claimable — which is correct, and worth stating so nobody
    // "fixes" it later. Nothing serves dehub.io/explore.eth but a profile.
    expect(couldBeProfileSegment('explore.eth', SYSTEM_ROUTES)).toBe(true);
  });
});
