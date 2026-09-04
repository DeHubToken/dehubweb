import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The paid translation tiers refuse a language they have no promptable name
 * for, so a locale the picker offers but `_shared/language-names.ts` does not
 * know is a language whose translations quietly stop working the moment the
 * free provider misses. `mg` and `sa` sat in that gap.
 *
 * The map is Deno source consumed by edge functions, so it is read as text
 * rather than imported.
 */
const MAP_SOURCE = readFileSync(
  resolve('supabase/functions/_shared/language-names.ts'),
  'utf8',
);

function mappedCodes(): Set<string> {
  const body = MAP_SOURCE.split('LANGUAGE_NAMES: Record<string, string> = {')[1] ?? '';
  const entries = body.split('};')[0] ?? '';
  return new Set(
    [...entries.matchAll(/^\s*'?([A-Za-z-]+)'?\s*:/gm)].map((match) => match[1].toLowerCase()),
  );
}

describe('translation language names', () => {
  it('names every locale the app can be set to', () => {
    const codes = mappedCodes();
    const locales = readdirSync(resolve('src/i18n/locales'))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', '').toLowerCase());

    expect(locales.length).toBeGreaterThan(100);

    const missing = locales.filter(
      (locale) => !codes.has(locale) && !codes.has(locale.split('-')[0]),
    );
    expect(missing, `No promptable name for: ${missing.join(', ')}`).toEqual([]);
  });
});
