import { describe, expect, it } from 'vitest';
import { getAiScrapingPreference, mergeAiScrapingPreference } from '@/lib/ai-scraping';

describe('getAiScrapingPreference', () => {
  it('defaults to deny when customs is absent', () => {
    expect(getAiScrapingPreference(undefined)).toBe('deny');
    expect(getAiScrapingPreference(null)).toBe('deny');
  });

  it('defaults to deny when the key is missing', () => {
    expect(getAiScrapingPreference({})).toBe('deny');
    expect(getAiScrapingPreference({ otherKey: 'x' })).toBe('deny');
  });

  it('reads an explicit allow', () => {
    expect(getAiScrapingPreference({ aiScraping: 'allow' })).toBe('allow');
  });

  it('reads an explicit deny', () => {
    expect(getAiScrapingPreference({ aiScraping: 'deny' })).toBe('deny');
  });

  it('falls back to deny on a malformed value', () => {
    expect(getAiScrapingPreference({ aiScraping: 'yes' })).toBe('deny');
    expect(getAiScrapingPreference({ aiScraping: true })).toBe('deny');
    expect(getAiScrapingPreference({ aiScraping: 1 })).toBe('deny');
    expect(getAiScrapingPreference({ aiScraping: '' })).toBe('deny');
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
