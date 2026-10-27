import { expect, it } from 'vitest';
import { isAdSurfaceRouteVisible } from '../lib/ads/surface-route';

it.each(['/', '/app', '/app/', '/videos', '/shorts'])('keeps home ads active on %s', path => {
  expect(isAdSurfaceRouteVisible('home', path)).toBe(true);
  expect(isAdSurfaceRouteVisible('related', path)).toBe(false);
});
it.each(['/post/1', '/app/post/1', '/video/1', '/app/video/1', '/posts/1/b/2'])('only requests related ads on %s', path => {
  expect(isAdSurfaceRouteVisible('related', path)).toBe(true);
  expect(isAdSurfaceRouteVisible('home', path)).toBe(false);
});
it.each(['/messages', '/app/settings', '/dao', '/launchpad'])('does not serve cached feed ads on %s', path => {
  expect(isAdSurfaceRouteVisible('home', path)).toBe(false);
  expect(isAdSurfaceRouteVisible('related', path)).toBe(false);
});
