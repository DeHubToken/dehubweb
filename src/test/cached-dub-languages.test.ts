import { expect, it } from 'vitest';
import { dubLanguage, hasCachedDubLanguage } from '@/lib/cached-dub-languages';

it('reuses the exact translated language, including regional and script tags', () => {
  expect(dubLanguage('en-GB')).toBe('en-gb');
  expect(dubLanguage('zh_TW')).toBe('zh-tw');
  expect(dubLanguage('zh-Hant')).toBe('zh-hant');
  expect(hasCachedDubLanguage('en-GB')).toBe(true);
  expect(hasCachedDubLanguage('zh-Hant')).toBe(true);
  expect(hasCachedDubLanguage('hu')).toBe(false);
});
