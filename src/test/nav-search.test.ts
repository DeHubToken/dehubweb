/**
 * The menu search's contract.
 *
 * Two different things are checked here, and both are things the compiler
 * cannot see.
 *
 * The first is BEHAVIOUR: the keyword table exists so that people who do not
 * know what we called a page can still find it, and the only way to know that
 * still holds after an edit is to type the words they type. Every case below
 * is phrased as a query someone would actually enter.
 *
 * The second is the JOINS. nav-search.ts deliberately keeps its own copy of
 * the Arcade's games rather than importing `config/arcade-games` — that
 * registry drags in the GPU probe, and this module is loaded eagerly by
 * AppSidebar, so importing it would fold the registry into the entry chunk
 * that scripts/check-entry-bundle.mjs guards. A copy is only safe if something
 * fails when it drifts, which is what the last block is.
 */

import { describe, expect, it } from 'vitest';
import { ARCADE_GAMES } from '@/config/arcade-games';
import { NAV_ITEMS } from '@/constants/app.constants';
import { NAV_LABEL_KEYS } from '@/components/app/navigation/SidebarNavItem';
import {
  filterNavItems,
  NAV_KEYWORDS,
  SEARCH_ONLY_ITEMS,
} from '@/components/app/navigation/nav-search';
import en from '@/i18n/locales/en.json';
import { humanizeTranslationKey } from '@/i18n/missing-key-fallback';

/**
 * Stands in for react-i18next's `t` exactly as the app configures it: resolve
 * the key against the English bundle, and fall back to the humanised key when
 * it is missing — which is how the Arcade titles come through.
 */
const t = (key: string): string => {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
  return typeof value === 'string' ? value : humanizeTranslationKey(key);
};

/** Labels of everything the menu returns for `query`, in rank order. */
const search = (query: string): string[] =>
  filterNavItems(NAV_ITEMS, query, t).map((item) => item.label);

const pathFor = (label: string): string | undefined =>
  [...NAV_ITEMS, ...SEARCH_ONLY_ITEMS].find((item) => item.label === label)?.path;

describe('menu search — the query someone actually types', () => {
  it('leaves the menu alone, by identity, when nothing is typed', () => {
    // Not cosmetic: the rail re-runs this on every render, and a fresh array
    // each time would remount all 28 rows.
    expect(filterNavItems(NAV_ITEMS, '', t)).toBe(NAV_ITEMS);
    expect(filterNavItems(NAV_ITEMS, '   ', t)).toBe(NAV_ITEMS);
  });

  it('finds the Arcade from "games", which is the word the row does not use', () => {
    expect(search('games')).toContain('Arcade');
    expect(search('game')).toContain('Arcade');
    expect(search('play')).toContain('Arcade');
  });

  it('takes "kings gambit" to the game itself, with the Arcade behind it', () => {
    const results = search('kings gambit');
    expect(results[0]).toBe("King's Gambit");
    expect(results).toContain('Arcade');
    expect(pathFor("King's Gambit")).toBe('/arcade/kings-gambit');
  });

  it('does not need the apostrophe, the capitals or the space', () => {
    for (const query of ["King's Gambit", 'kings gambit', 'KINGS GAMBIT', 'kingsgambit']) {
      expect(search(query), query).toContain("King's Gambit");
    }
  });

  it('finds the chess game from "chess", which appears in no label anywhere', () => {
    const results = search('chess');
    expect(results).toContain("King's Gambit");
    expect(results).toContain('Arcade');
  });

  it('answers the everyday shorthands', () => {
    expect(search('dm')).toContain('Messages');
    expect(search('vote')).toContain('Governance');
    expect(search('apy')).toContain('Staking');
    expect(search('saved')).toContain('Bookmarks');
    expect(search('dark mode')).toContain('Settings');
    expect(search('referral')).toContain('Affiliate');
    expect(search('shop')).toContain('Stores');
  });

  it('survives a typo once the word is long enough to be sure of', () => {
    expect(search('arcde')).toContain('Arcade');
    expect(search('setings')).toContain('Settings');
    expect(search('governence')).toContain('Governance');
    // Three characters is too short to correct: one edit from "dos" reaches
    // half the menu, so it stays a prefix match and nothing else.
    expect(search('dos')).not.toContain('Docs');
  });

  it('ranks a name match above a keyword match', () => {
    // Command Centre carries "my stats" as a keyword; Stats is called Stats.
    expect(search('stats')[0]).toBe('Stats');
    // Arcade is a game keyword on all three games and its own name here.
    expect(search('arcade')[0]).toBe('Arcade');
    expect(search('wallet')[0]).toBe('Wallet');
  });

  it('requires every word to land somewhere', () => {
    expect(search('kings zzzzz')).toEqual([]);
    expect(search('zzzzz')).toEqual([]);
  });
});

describe('menu search — destinations that are not on the menu', () => {
  it('reveals a real page that has no rail row', () => {
    expect(search('apk')).toContain('Get the App');
    expect(search('android')).toContain('Get the App');
    expect(search('reels')).toContain('Shorts');
    expect(search('mcp')).toContain('Connect AI');
    expect(search('market cap')).toContain('Top 100');
  });

  it('keeps them hidden until there is more than one character to go on', () => {
    // A single letter is a keystroke on the way to a word, not a decision to
    // go hunting for an unlisted page.
    expect(search('v')).not.toContain('Videos');
    expect(search('vi')).toContain('Videos');
  });

  it('never renders the same destination twice', () => {
    for (const query of ['a', 'e', 'o', 'st', 'game', 'live', 'buy']) {
      const results = search(query);
      expect(new Set(results).size, query).toBe(results.length);
    }
  });

  it('claims no path the rail already owns', () => {
    const railPaths = new Set(NAV_ITEMS.map((item) => item.path));
    for (const item of SEARCH_ONLY_ITEMS) {
      expect(railPaths.has(item.path), item.label).toBe(false);
    }
  });
});

describe('menu search — matching in the reader’s own language', () => {
  const turkish: Record<string, string> = { 'nav.settings': 'Ayarlar', 'nav.wallet': 'Cüzdan' };
  const tr = (key: string) => turkish[key] ?? t(key);

  const searchTr = (query: string) =>
    filterNavItems(NAV_ITEMS, query, tr).map((item) => item.label);

  it('matches the translated label', () => {
    expect(searchTr('ayarlar')).toContain('Settings');
    expect(searchTr('cüzdan')).toContain('Wallet');
    // Accents are folded, so the reader who cannot reach ü on their keyboard
    // still gets there.
    expect(searchTr('cuzdan')).toContain('Wallet');
  });

  it('still matches the English label, because the keywords are English anyway', () => {
    expect(searchTr('settings')).toContain('Settings');
    expect(searchTr('wallet')).toContain('Wallet');
  });
});

describe('menu search — the joins nothing else checks', () => {
  const searchOnlyLabels = SEARCH_ONLY_ITEMS.map((item) => item.label);
  const everyLabel = new Set([...NAV_ITEMS.map((item) => item.label), ...searchOnlyLabels]);

  it('has a row for every game in the Arcade registry', () => {
    // The copy in nav-search.ts is the price of keeping the GPU probe out of
    // the entry chunk. This is what stops it going stale: add a game to
    // config/arcade-games.ts and this fails until the menu knows about it.
    for (const game of ARCADE_GAMES) {
      const row = SEARCH_ONLY_ITEMS.find((item) => item.path === `/arcade/${game.slug}`);
      expect(row, game.slug).toBeDefined();
      expect(row?.label, game.slug).toBe(game.title);
      expect(search(game.title), game.title).toContain(game.title);
    }
  });

  it('keys every keyword list to a destination that exists', () => {
    for (const label of Object.keys(NAV_KEYWORDS)) {
      expect(everyLabel.has(label), `keywords for "${label}" match no destination`).toBe(true);
    }
  });

  it('gives every destination something to be found by', () => {
    const keywords = NAV_KEYWORDS;
    for (const label of everyLabel) {
      // Stages, Bounties, Affiliate and Stores read as themselves; what
      // matters is that nothing is reachable by its exact name alone.
      expect(keywords[label]?.length, `"${label}" has no keywords`).toBeGreaterThan(0);
    }
  });

  it('renders every search-only row with a real label', () => {
    for (const item of SEARCH_ONLY_ITEMS) {
      const rendered = t(NAV_LABEL_KEYS[item.label] || item.label);
      expect(rendered, item.label).toBeTruthy();
      expect(rendered, item.label).not.toBe('Translation unavailable');
    }
  });
});
