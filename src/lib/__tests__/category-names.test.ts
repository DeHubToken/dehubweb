import { describe, expect, it } from 'vitest';
import { normalizeCategoryList, normalizeCategoryName, renamedCategory } from '@/lib/category-names';

describe('normalizeCategoryName', () => {
  it('drops leading hashtag and mention marks', () => {
    expect(normalizeCategoryName('#business')).toBe('business');
    expect(normalizeCategoryName('@bollywood')).toBe('bollywood');
    expect(normalizeCategoryName('  ##@free ')).toBe('free');
  });

  it('collapses inner whitespace', () => {
    expect(normalizeCategoryName('astronomy ')).toBe('astronomy');
    expect(normalizeCategoryName('board   game')).toBe('board game');
  });
});

describe('normalizeCategoryList', () => {
  it('splits joined picker selections and comma lists', () => {
    expect(normalizeCategoryList(['mystery|||fictional story|||#family secrets', 'cats, pets']))
      .toEqual(['mystery', 'fictional story', 'family secrets', 'cats', 'pets']);
  });

  it('dedupes case-insensitively and drops empties', () => {
    expect(normalizeCategoryList(['#All', 'all', '@', '', 'Music'])).toEqual(['All', 'Music']);
  });
});

describe('renamedCategory', () => {
  it('opens old DeHub tags as their Riftn names', () => {
    expect(renamedCategory('DeHub')).toBe('riftn');
    expect(renamedCategory('dehub-wave')).toBe('riftn-wave');
    expect(renamedCategory('dehubbers')).toBe('rifters');
    expect(renamedCategory('Music')).toBe('music');
  });
});
