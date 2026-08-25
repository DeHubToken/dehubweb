/**
 * /cinema has two distinct "not live yet" states and one real failure state,
 * and the page renders a completely different thing for each. These pin the
 * mapping, because getting it wrong is silent: the search UI stays up and
 * answers "Nothing found for <query>", which reads to a visitor as "that film
 * does not exist" rather than "this feature has not launched".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchProviders,
  searchTitles,
  JustWatchNotConfiguredError,
} from '../api/justwatch';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('justwatch client — not-configured mapping', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a 404 to NotConfigured, because an undeployed function is not an error', () => {
    // Supabase answers 404 NOT_FOUND for a function that was never deployed.
    // Edge functions do not ship with the web deploy, so this is the live
    // response for the whole window between merging /cinema and deploying it.
    vi.stubGlobal('fetch', mockFetch(404, { code: 'NOT_FOUND' }));

    return expect(fetchProviders('en_GB')).rejects.toBeInstanceOf(
      JustWatchNotConfiguredError,
    );
  });

  it('maps configured:false to NotConfigured, so a missing token is not a crash', () => {
    // The function is deployed but JUSTWATCH_TOKEN is unset. It answers 200 on
    // purpose — a 500 here would be retried and logged as a fault.
    vi.stubGlobal('fetch', mockFetch(200, { configured: false }));

    return expect(searchTitles('dune', 'en_GB')).rejects.toBeInstanceOf(
      JustWatchNotConfiguredError,
    );
  });

  it('leaves a 502 as a real error, because an upstream outage is not a pre-launch state', () => {
    // The partner API is down or rejected the token. The page must NOT claim
    // to be unlaunched — that would hide a live outage behind a coming-soon
    // panel and nobody would notice.
    vi.stubGlobal('fetch', mockFetch(502, { error: 'JustWatch upstream error' }));

    return expect(fetchProviders('en_GB')).rejects.not.toBeInstanceOf(
      JustWatchNotConfiguredError,
    );
  });

  it('passes a good response straight through', async () => {
    const providers = [{ id: 8, name: 'Netflix', icon: null, technicalName: 'netflix', monetizationTypes: ['flatrate'] }];
    vi.stubGlobal('fetch', mockFetch(200, { configured: true, providers }));

    await expect(fetchProviders('en_GB')).resolves.toEqual({ configured: true, providers });
  });
});

/**
 * The case the tests above missed.
 *
 * They mocked fetch as RESOLVING with a 404, which is not what a browser does.
 * Supabase's 404 for an undeployed function carries no CORS headers, so the
 * preflight fails and fetch REJECTS — the status is never observed, and every
 * `res.status === 404` branch is dead code until the function exists. The suite
 * was green, the typecheck was clean, and the page still showed a live search
 * box that answered "Nothing found" for every query.
 */
describe('justwatch client — unreachable, not merely 404', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats a rejected fetch as NotConfigured', () => {
    // What a CORS-blocked preflight actually produces.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    return expect(fetchProviders('en_GB')).rejects.toBeInstanceOf(
      JustWatchNotConfiguredError,
    );
  });

  it('treats a rejected search the same way', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    return expect(searchTitles('dune', 'en_GB')).rejects.toBeInstanceOf(
      JustWatchNotConfiguredError,
    );
  });
});

describe('film-reviews client — unreachable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats a rejected fetch as Unavailable, so the section hides instead of looking empty', async () => {
    const { fetchFilmReviews, FilmReviewsUnavailableError } = await import('../api/film-reviews');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(fetchFilmReviews('12345', 'movie')).rejects.toBeInstanceOf(
      FilmReviewsUnavailableError,
    );
  });
});
