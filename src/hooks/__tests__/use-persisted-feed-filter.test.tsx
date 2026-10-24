import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePersistedFeedFilter, usePersistedContentFilters, clearPersistedFeedFilters } from '@/hooks/use-persisted-feed-filter';
import { readFeedToggles, resetFeedToggles, serializeFeedToggles, parseFeedToggles, seedDefaultFeedTab, setDefaultFeedTab } from '@/lib/feed-defaults';
import { SORT_OPTIONS, DATE_FILTER_OPTIONS } from '@/lib/feed-utils';

const LATEST = SORT_OPTIONS.find((o) => o.value === 'latest')!;
const MOST_LIKED = SORT_OPTIONS.find((o) => o.value === 'most-liked')!;
const DURATIONS = [
  { label: 'Any', min: 0, max: Infinity },
  { label: '< 1 min', min: 0, max: 60 },
  { label: '20+ min', min: 1200, max: Infinity },
];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('saved feed toggles', () => {
  it('saves a toggle as the default and opens a new session with it', () => {
    const { result } = renderHook(() => usePersistedFeedFilter('home', 'sort', LATEST, SORT_OPTIONS));
    act(() => result.current[1](MOST_LIKED));
    expect(readFeedToggles()).toEqual({ home: { sort: 'most-liked' } });

    sessionStorage.clear(); // new session
    const next = renderHook(() => usePersistedFeedFilter('home', 'sort', LATEST, SORT_OPTIONS));
    expect(next.result.current[0]).toBe(MOST_LIKED);
  });

  it('drops a toggle set back to the feed default', () => {
    const { result } = renderHook(() => usePersistedFeedFilter('videos', 'date', DATE_FILTER_OPTIONS[0], DATE_FILTER_OPTIONS));
    act(() => result.current[1](DATE_FILTER_OPTIONS[2]));
    act(() => result.current[1](DATE_FILTER_OPTIONS[0]));
    expect(readFeedToggles()).toEqual({});
  });

  it('restores open-ended durations to the real option (Infinity survives)', () => {
    const { result } = renderHook(() => usePersistedFeedFilter('videos', 'duration', DURATIONS[0], DURATIONS));
    act(() => result.current[1](DURATIONS[2]));
    // Same session: read back out of sessionStorage, where Infinity became null.
    const again = renderHook(() => usePersistedFeedFilter('videos', 'duration', DURATIONS[0], DURATIONS));
    expect(again.result.current[0]).toBe(DURATIONS[2]);
    expect(again.result.current[0].max).toBe(Infinity);
  });

  it('stores content chips as the list switched on', () => {
    const { result } = renderHook(() => usePersistedContentFilters('home'));
    act(() => result.current[1]('w2e'));
    expect(readFeedToggles()).toEqual({ home: { contentFilters: ['w2e'] } });
    sessionStorage.clear();
    const next = renderHook(() => usePersistedContentFilters('home'));
    expect(next.result.current[0]).toEqual({ ppv: false, w2e: true, locked: false });
  });

  it('pull to refresh keeps the saved toggles; Reset clears them everywhere', () => {
    const { result } = renderHook(() => usePersistedFeedFilter('home', 'sort', LATEST, SORT_OPTIONS));
    act(() => result.current[1](MOST_LIKED));
    clearPersistedFeedFilters();
    expect(renderHook(() => usePersistedFeedFilter('home', 'sort', LATEST, SORT_OPTIONS)).result.current[0]).toBe(MOST_LIKED);

    act(() => resetFeedToggles());
    expect(result.current[0]).toBe(LATEST);
    expect(readFeedToggles()).toEqual({});
  });

  it('a name saved for an option object never comes back as a bare string', () => {
    localStorage.setItem('dehub:feedToggles', JSON.stringify({ home: { sort: 'most-liked' } }));
    const { result } = renderHook(() => usePersistedFeedFilter('home', 'sort', LATEST));
    expect(result.current[0]).toBe(LATEST);
  });

  it('keeps the account value under the 500 character customs limit', () => {
    const toggles = { home: { sort: 'most-liked', categories: Array.from({ length: 80 }, (_, i) => `category-${i}`) } };
    const json = serializeFeedToggles(toggles);
    expect(json.length).toBeLessThanOrEqual(500);
    expect(parseFeedToggles(json)).toEqual({ home: { sort: 'most-liked' } });
  });
});

describe('default feed tab', () => {
  it('a fresh session opens on the default tab; a reload keeps the current one', () => {
    setDefaultFeedTab('videos');
    seedDefaultFeedTab();
    expect(JSON.parse(sessionStorage.getItem('home-feed-state')!)).toEqual({ tab: 'videos' });

    sessionStorage.setItem('home-feed-state', JSON.stringify({ tab: 'live' }));
    seedDefaultFeedTab();
    expect(JSON.parse(sessionStorage.getItem('home-feed-state')!)).toEqual({ tab: 'live' });
  });
});
