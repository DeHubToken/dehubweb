import { describe, expect, it } from 'vitest';
import { activeFeedSearchQuery, closeFeedSearch, feedSearchParams, getFeedSearchState, openFeedSearch, parkFeedSearch, setFeedSearchQuery } from './feed-search';

describe('feedSearchParams', () => {
  it('searches only the feed it was opened on', () => {
    expect(feedSearchParams('images', {}, 'sunset').postType).toBe('feed-images');
    expect(feedSearchParams('videos', {}, 'skate').postType).toBe('video');
    expect(feedSearchParams('music', {}, 'lofi').postType).toBe('feed-audio');
    expect(feedSearchParams('home', {}, 'dehub').postType).toBeUndefined();
  });

  it('follows the feed toggles', () => {
    const p = feedSearchParams('videos', { sort: 'most-viewed', date: 'week', contentFilters: ['ppv', 'w2e'], category: 'Music' }, 'skate');
    expect(p).toMatchObject({ search: 'skate', sortBy: 'views', range: 'week', isPPV: true, hasBounty: true, category: 'Music' });
    expect(p.isLocked).toBeUndefined();
  });

  it('reads content toggles stored as flags too', () => {
    expect(feedSearchParams('images', { contentFilters: { ppv: false, locked: true } }, 'x')).toMatchObject({ isLocked: true, isPPV: undefined });
  });

  it('drops the date for all-time sorts, like the feeds do', () => {
    expect(feedSearchParams('images', { sort: 'most-liked', date: 'week' }, 'x').range).toBeUndefined();
    expect(feedSearchParams('images', { sort: 'following' }, 'x')).toMatchObject({ followingOnly: true, sortBy: 'createdAt' });
  });

  it('searches music videos from the Music Videos chart', () => {
    expect(feedSearchParams('music', { subTab: 'videos' }, 'x')).toMatchObject({ postType: 'video', category: 'Music' });
  });

  it('uses the Home post type and a single category', () => {
    expect(feedSearchParams('home', { postType: 'feed-audio', categories: ['Gaming'] }, 'x')).toMatchObject({ postType: 'feed-audio', category: 'Gaming' });
    expect(feedSearchParams('home', { categories: ['a', 'b'] }, 'x').category).toBeUndefined();
  });
});

describe('feed search state', () => {
  it('opens, takes words and forgets them on close', () => {
    openFeedSearch();
    expect(activeFeedSearchQuery(getFeedSearchState())).toBe('');
    setFeedSearchQuery('  lofi ');
    expect(activeFeedSearchQuery(getFeedSearchState())).toBe('lofi');
    closeFeedSearch();
    expect(getFeedSearchState()).toEqual({ open: false, query: '' });
  });

  it('keeps the words when Home puts the search away, and hands them back once', () => {
    setFeedSearchQuery('sunset');
    parkFeedSearch();
    expect(getFeedSearchState()).toEqual({ open: false, query: '' });
    openFeedSearch();
    expect(getFeedSearchState()).toEqual({ open: true, query: 'sunset' });
    closeFeedSearch();
    openFeedSearch();
    expect(getFeedSearchState().query).toBe('');
    closeFeedSearch();
  });
});
