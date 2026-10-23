import { afterEach, describe, expect, it } from 'vitest';
import { captureFirstTouch, getFirstTouch, readUtm } from './first-touch';

const here = () => ({ path: window.location.pathname, search: window.location.search, referrer: '' });
const clearCookie = () => { document.cookie = 'dehub_ft=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; };

afterEach(() => {
  window.localStorage.clear();
  clearCookie();
  window.history.replaceState(null, '', '/');
});

describe('first touch', () => {
  it('reads only the UTM tags, trimmed and capped', () => {
    expect(readUtm('?utm_source=%20x%20&utm_medium=social&ref=ABC&utm_campaign=' + 'c'.repeat(150)))
      .toEqual({ utm_source: 'x', utm_medium: 'social', utm_campaign: 'c'.repeat(100) });
    expect(readUtm('')).toEqual({});
  });

  it('keeps the first landing and ignores later ones', () => {
    window.history.replaceState(null, '', '/app/post/9?utm_source=newsletter&utm_campaign=launch');
    captureFirstTouch(here());
    window.history.replaceState(null, '', '/explore?utm_source=x');
    captureFirstTouch(here());

    expect(getFirstTouch()).toMatchObject({
      utm_source: 'newsletter',
      utm_campaign: 'launch',
      landing_path: '/app/post/9',
    });
  });

  it('falls back to the cookie when localStorage was cleared', () => {
    window.history.replaceState(null, '', '/r/ABC123?utm_medium=dm');
    captureFirstTouch(here());
    window.localStorage.clear();
    expect(getFirstTouch()).toMatchObject({ utm_medium: 'dm', landing_path: '/r/ABC123' });
  });
});
