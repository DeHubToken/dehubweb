/**
 * The settings search's contract.
 *
 * Two things here the compiler cannot see.
 *
 * The JOIN first: every index entry names an `anchor`, and the jump only works
 * if a matching `data-setting-anchor` (or an `anchor` prop that becomes one)
 * exists in the page. Nothing links the two at build time — rename a section
 * and search silently goes back to what it used to do, which is switch tab and
 * abandon you. So the anchors are read straight out of the source here.
 *
 * Then BEHAVIOUR: the ranking and the keyword table exist so someone who does
 * not know what we called a setting still lands on it. Every query below is
 * phrased the way a reader would actually type it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SETTINGS_SEARCH_INDEX, searchSettings } from '@/lib/settings-search';

/** Stand-in for i18next's `t` — returns the fallback, as English does. */
const t = ((key: string, fallback?: string) => fallback ?? key) as never;

function collectSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) collectSources(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(readFileSync(full, 'utf8'));
  }
  return out;
}

const SOURCES = [
  readFileSync(resolve(__dirname, '../pages/app/SettingsPage.tsx'), 'utf8'),
  ...collectSources(resolve(__dirname, '../components/app/settings')),
].join('\n');

const ANCHORS_IN_SOURCE = new Set([
  ...SOURCES.matchAll(/data-setting-anchor="([a-z0-9-]+)"/g),
  ...SOURCES.matchAll(/\banchor="([a-z0-9-]+)"/g),
].map((m) => m[1]));

describe('settings search index', () => {
  it('points every entry at an anchor that exists in the page', () => {
    const missing = SETTINGS_SEARCH_INDEX
      .filter((entry) => !ANCHORS_IN_SOURCE.has(entry.anchor))
      .map((entry) => `${entry.tab}/${entry.anchor}`);
    expect(missing).toEqual([]);
  });

  it('does not index the same anchor twice', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of SETTINGS_SEARCH_INDEX) {
      if (seen.has(entry.anchor)) duplicates.push(entry.anchor);
      seen.add(entry.anchor);
    }
    expect(duplicates).toEqual([]);
  });
});

describe('searchSettings', () => {
  const top = (query: string) => searchSettings(query, t)[0];

  it('returns nothing for an empty query', () => {
    expect(searchSettings('', t)).toEqual([]);
    expect(searchSettings('   ', t)).toEqual([]);
  });

  it('puts the closest label first', () => {
    // "the" appears inside several descriptions-worth of keywords; the label
    // that starts with it has to win.
    expect(top('the')?.anchor).toBe('theme');
    expect(top('message fee')?.anchor).toBe('message-fee');
    expect(top('quiet')?.anchor).toBe('quiet-hours');
  });

  it('finds settings by what people call them, not what we called them', () => {
    expect(top('dark mode')?.anchor).toBe('theme');
    expect(top('2fa')?.anchor).toBe('two-factor');
    expect(top('nsfw')?.anchor).toBe('mature-content');
    expect(top('avatar')?.anchor).toBe('profile-picture');
    expect(top('dnd')?.anchor).toBe('do-not-disturb');
    expect(top('banner')?.anchor).toBe('cover-image');
  });

  it('requires every word typed to match something', () => {
    // "message" alone hits several rows; adding a word that matches none of
    // them has to empty the list rather than fall back to the loose match.
    expect(searchSettings('message zzzz', t)).toEqual([]);
  });

  it('caps the list so the dropdown cannot outgrow the page', () => {
    expect(searchSettings('e', t).length).toBeLessThanOrEqual(8);
  });

  it('carries the tab, so a hit can switch to it before scrolling', () => {
    expect(top('geo')?.tab).toBe('privacy');
    expect(top('gas')?.tab).toBe('assets');
    expect(top('report a bug')?.tab).toBe('support');
  });
});
