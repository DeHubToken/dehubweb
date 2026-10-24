import { describe, expect, it } from 'vitest';
import { filterContextForPath, matchKeywordFilter } from '@/lib/keyword-filters';
import type { KeywordFilter } from '@/lib/api/dehub/keyword-filters';

const filter = (over: Partial<KeywordFilter>): KeywordFilter => ({
  id: over.phrase || 'f',
  phrase: 'cat',
  wholeWord: true,
  action: 'warn',
  contexts: ['home', 'public', 'notifications', 'thread', 'profile'],
  expiresAt: null,
  createdAt: null,
  ...over,
});

describe('keyword filter matching', () => {
  it('matches whole words, case-insensitively', () => {
    const filters = [filter({ phrase: 'cat' })];
    expect(matchKeywordFilter(['My CAT is asleep'], filters, 'home')?.phrase).toBe('cat');
    expect(matchKeywordFilter(['cat.'], filters, 'home')).not.toBeNull();
    expect(matchKeywordFilter(['A new category'], filters, 'home')).toBeNull();
  });

  it('matches inside words when whole-word is off', () => {
    expect(matchKeywordFilter(['A new category'], [filter({ phrase: 'cat', wholeWord: false })], 'home')).not.toBeNull();
  });

  it('matches a phrase across any run of spaces, and letters with accents', () => {
    expect(matchKeywordFilter(['the   world  cup final'], [filter({ phrase: 'world cup' })], 'home')).not.toBeNull();
    expect(matchKeywordFilter(['un café noir'], [filter({ phrase: 'café' })], 'home')).not.toBeNull();
    expect(matchKeywordFilter(['cafés'], [filter({ phrase: 'café' })], 'home')).toBeNull();
  });

  it('treats the phrase as text, not a pattern', () => {
    expect(matchKeywordFilter(['price is $5'], [filter({ phrase: '$5' , wholeWord: false })], 'home')).not.toBeNull();
    expect(matchKeywordFilter(['abc'], [filter({ phrase: 'a.c', wholeWord: false })], 'home')).toBeNull();
  });

  it('applies only in the places chosen', () => {
    const filters = [filter({ phrase: 'spoiler', contexts: ['home'] })];
    expect(matchKeywordFilter(['big spoiler'], filters, 'home')).not.toBeNull();
    expect(matchKeywordFilter(['big spoiler'], filters, 'thread')).toBeNull();
  });

  it('prefers hiding over warning, and ignores expired filters', () => {
    const filters = [
      filter({ phrase: 'match', action: 'warn' }),
      filter({ phrase: 'final', action: 'hide' }),
      filter({ phrase: 'score', action: 'hide', expiresAt: '2020-01-01T00:00:00Z' }),
    ];
    expect(matchKeywordFilter(['match final'], filters, 'home')?.action).toBe('hide');
    expect(matchKeywordFilter(['the score'], filters, 'home')).toBeNull();
  });

  it('reads every text it is given, and nothing when there are no filters', () => {
    expect(matchKeywordFilter([undefined, 'title', 'body with cat'], [filter({})], 'home')).not.toBeNull();
    expect(matchKeywordFilter(['cat'], [], 'home')).toBeNull();
  });
});

describe('filter places', () => {
  it.each([
    ['/', 'home'],
    ['/post/123', 'thread'],
    ['/video/9', 'thread'],
    ['/notifications', 'notifications'],
    ['/explore', 'public'],
    ['/search', 'public'],
    ['/shorts', 'public'],
    ['/maldoteth', 'profile'],
    ['/profile', 'profile'],
    ['/app', 'home'],
    ['/app/post/123', 'thread'],
    ['/app/notifications', 'notifications'],
    ['/app/explore', 'public'],
    ['/app/profile', 'profile'],
    ['/app/maldoteth', 'profile'],
  ])('%s is %s', (path, place) => {
    expect(filterContextForPath(path)).toBe(place);
  });
});
