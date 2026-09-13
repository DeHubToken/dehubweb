/**
 * public/seo-i18n.json is generated from the locale files by
 * scripts/build-seo-i18n.mjs and read by the worker at request time. It is
 * committed rather than built, so this is what keeps it honest: rebuild it
 * from the locales here and fail when the committed copy is behind. It also
 * pins the two rules the worker relies on — every code is ISO 639-1, and a
 * locale is listed for a route only with both a title and a description.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSeoI18n, SEO_I18N_ROUTES } from '../../scripts/build-seo-i18n.mjs';

const ROOT = resolve(__dirname, '../..');
const committed = JSON.parse(readFileSync(resolve(ROOT, 'public/seo-i18n.json'), 'utf8')) as Record<
  string,
  Record<string, { title: string; description: string }>
>;

describe('seo-i18n.json', () => {
  it('matches what the locale files say — run node scripts/build-seo-i18n.mjs after editing an SEO key', () => {
    expect(committed).toEqual(buildSeoI18n(resolve(ROOT, 'src/i18n/locales')));
  });

  it('covers every mapped route, and every route is a mapped one', () => {
    expect(Object.keys(committed).sort()).toEqual(Object.values(SEO_I18N_ROUTES).sort());
  });

  it('lists only ISO 639-1 codes, each with a non-empty title and description', () => {
    for (const [route, langs] of Object.entries(committed)) {
      expect(langs.en, `${route} has no English row`).toBeTruthy();
      for (const [code, t] of Object.entries(langs)) {
        expect(code, `${route}:${code}`).toMatch(/^[a-z]{2}$/);
        expect(t.title.trim().length, `${route}:${code} title`).toBeGreaterThan(0);
        expect(t.description.trim().length, `${route}:${code} description`).toBeGreaterThan(0);
      }
    }
  });

  it('is actually translated, not eighty copies of the English row', () => {
    const tv = committed['/tv'];
    const distinct = new Set(Object.values(tv).map((t) => t.title));
    expect(distinct.size).toBeGreaterThan(Object.keys(tv).length / 2);
  });
});
