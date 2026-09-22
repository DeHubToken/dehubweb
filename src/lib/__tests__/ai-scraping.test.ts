import { describe, expect, it } from 'vitest';
import { getAiScrapingPreference, mergeAiScrapingPreference } from '@/lib/ai-scraping';

describe('getAiScrapingPreference', () => {
  it('defaults to allow when customs is absent', () => {
    expect(getAiScrapingPreference(undefined)).toBe('allow');
    expect(getAiScrapingPreference(null)).toBe('allow');
  });

  it('defaults to allow when the key is missing', () => {
    expect(getAiScrapingPreference({})).toBe('allow');
    expect(getAiScrapingPreference({ otherKey: 'x' })).toBe('allow');
  });

  it('reads an explicit allow', () => {
    expect(getAiScrapingPreference({ aiScraping: 'allow' })).toBe('allow');
  });

  it('reads an explicit deny', () => {
    expect(getAiScrapingPreference({ aiScraping: 'deny' })).toBe('deny');
  });

  it('falls back to allow on a malformed value', () => {
    expect(getAiScrapingPreference({ aiScraping: 'no' })).toBe('allow');
    expect(getAiScrapingPreference({ aiScraping: true })).toBe('allow');
    expect(getAiScrapingPreference({ aiScraping: 1 })).toBe('allow');
    expect(getAiScrapingPreference({ aiScraping: '' })).toBe('allow');
  });
});

describe('mergeAiScrapingPreference', () => {
  it('adds the key onto an empty blob', () => {
    expect(mergeAiScrapingPreference(undefined, 'allow')).toEqual({ aiScraping: 'allow' });
    expect(mergeAiScrapingPreference(null, 'deny')).toEqual({ aiScraping: 'deny' });
  });

  it('preserves every other key already in the blob', () => {
    const existing = { followVisibility: 'public', defaultPostVisibility: 'private' };
    expect(mergeAiScrapingPreference(existing, 'allow')).toEqual({
      followVisibility: 'public',
      defaultPostVisibility: 'private',
      aiScraping: 'allow',
    });
  });

  it('overwrites a previous preference in place', () => {
    expect(mergeAiScrapingPreference({ aiScraping: 'allow' }, 'deny')).toEqual({ aiScraping: 'deny' });
  });
});
