import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_CANVAS_THEMES, getDocsForcedTheme } from '@/lib/docs-theme';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

/** Every theme value offered in Settings → Appearance. */
function appThemes(): string[] {
  const src = read('pages/app/SettingsPage.tsx');
  const block = src.slice(src.indexOf('const THEME_OPTIONS'), src.indexOf('];', src.indexOf('const THEME_OPTIONS')));
  return [...block.matchAll(/value: '([a-z]+)'/g)].map((m) => m[1]);
}

/** The theme lists inside each `html:is(...)` scope in docs-glass.css. */
function glassScopes(): string[][] {
  const css = read('styles/docs-glass.css');
  return [...css.matchAll(/html:is\(([^)]*)\)/g)].map((m) =>
    [...m[1].matchAll(/data-theme="([a-z]+)"/g)].map((t) => t[1]).sort(),
  );
}

describe('docs theme lists', () => {
  const canvas = [...DOCS_CANVAS_THEMES].sort();

  it('pins every app theme to a docs look, leaving only system on the toggle', () => {
    for (const theme of appThemes()) {
      if (theme === 'system') expect(getDocsForcedTheme(theme)).toBeUndefined();
      else expect(getDocsForcedTheme(theme), theme).toBeDefined();
    }
  });

  it('treats every app theme other than system, light and minimal as a canvas theme', () => {
    const expected = appThemes().filter((t) => !['system', 'light', 'minimal'].includes(t)).sort();
    expect(canvas).toEqual(expected);
  });

  it('keeps every docs-glass.css scope on the same canvas theme list', () => {
    const scopes = glassScopes();
    expect(scopes.length).toBeGreaterThan(0);
    for (const scope of scopes) expect(scope).toEqual(canvas);
  });
});
