/**
 * The Arcade's contract with everything outside the registry.
 *
 * `config/arcade-games` is the single source of truth for the games, but three
 * things it points at live elsewhere and cannot be checked by the compiler: the
 * vendored build under `public/`, the card art, and the `_headers` block
 * without which a sandboxed frame silently fails to load its own entry script.
 * Every one of those is a "works on my machine until it is deployed" failure,
 * so they are asserted here instead.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ARCADE_GAMES, ARCADE_SANDBOX, getArcadeGame } from '@/config/arcade-games';

beforeAll(() => {
  // jsdom has no canvas backend, and `buildUrl` probes the GPU to choose a
  // quality preset. Left alone, jsdom prints a "Not implemented" stack for
  // every call. Returning null is exactly what a browser with no WebGL does,
  // which is a case the probe is built to handle — so this makes the test
  // environment explicit rather than papering over anything.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

const repo = (...parts: string[]) => resolve(__dirname, '../..', ...parts);

/** Vendored game directory for a slug, as `_headers` and the URLs spell it. */
const GAME_DIRS: Record<string, string> = {
  'kings-gambit': 'chess-game',
  'claude-of-duty': 'war-game',
  'jungle-trail': 'jungle-game',
};

describe('arcade registry', () => {
  it('has unique slugs', () => {
    const slugs = ARCADE_GAMES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('resolves a game by slug and nothing by a slug that is not there', () => {
    expect(getArcadeGame('kings-gambit')?.title).toBe("King's Gambit");
    expect(getArcadeGame('not-a-game')).toBeUndefined();
    expect(getArcadeGame(undefined)).toBeUndefined();
  });

  it('never grants allow-same-origin', () => {
    // The whole security posture of the arcade rests on this one absence: the
    // games are third-party code served from our own origin, so with it they
    // would reach app storage, cookies and the parent DOM.
    expect(ARCADE_SANDBOX).not.toContain('allow-same-origin');
    expect(ARCADE_SANDBOX).toContain('allow-scripts');
  });

  it('builds a frame URL under the game it belongs to', () => {
    for (const game of ARCADE_GAMES) {
      const url = game.buildUrl();
      expect(url, game.slug).toContain(`/${GAME_DIRS[game.slug]}/`);
    }
  });

  it('gives every game the copy the cards and SEO read', () => {
    for (const game of ARCADE_GAMES) {
      expect(game.title, game.slug).toBeTruthy();
      expect(game.tagline, game.slug).toBeTruthy();
      // Doubles as the meta description, which wants a real sentence.
      expect(game.description.length, game.slug).toBeGreaterThan(80);
      expect(game.controls.length, game.slug).toBeGreaterThan(0);
      expect(game.artAlt, game.slug).toBeTruthy();
      expect(game.credit.url, game.slug).toMatch(/^https:\/\//);
    }
  });
});

describe('arcade assets', () => {
  it('ships the card art each game points at', () => {
    for (const game of ARCADE_GAMES) {
      // `art` is a site-absolute URL; resolve() would treat the leading slash
      // as the filesystem root and quietly drop the public/ prefix.
      const file = repo('public', game.art.replace(/^\//, ''));
      expect(existsSync(file), `${game.slug}: ${game.art}`).toBe(true);
      expect(statSync(file).size, `${game.art} is unexpectedly empty`).toBeGreaterThan(2_000);
    }
  });

  it('ships the vendored build each game frames, with its provenance', () => {
    for (const game of ARCADE_GAMES) {
      const dir = GAME_DIRS[game.slug];
      expect(existsSync(repo('public', dir, 'index.html')), `${dir}/index.html`).toBe(true);
      // The README is what records the upstream, the commit and the local
      // patches. A vendored dependency without it is unmaintainable.
      expect(existsSync(repo('public', dir, 'README.md')), `${dir}/README.md`).toBe(true);
    }
  });

  it('ships the licence each credit names', () => {
    for (const game of ARCADE_GAMES) {
      expect(existsSync(repo(game.credit.licenceFile)), game.credit.licenceFile).toBe(true);
    }
  });
});

describe('arcade headers', () => {
  const headers = readFileSync(repo('public/_headers'), 'utf8');

  it('sends Access-Control-Allow-Origin for every built game frame', () => {
    // An opaque-origin iframe fetches its module entry in CORS mode with
    // `Origin: null`. Without this header the browser drops the script with no
    // error and no console output — just a black frame. It has cost this repo
    // two debugging sessions already.
    for (const dir of ['war-game', 'chess-game']) {
      const block = headers.split(`/${dir}/assets/*`)[1] ?? '';
      expect(block.slice(0, 200), dir).toContain('Access-Control-Allow-Origin: *');
    }
  });

  it('leaves the unhashed entry documents revalidating', () => {
    // assets/ is content-hashed and may be immutable; index.html is not, and
    // pinning it for a year means a re-vendored game never reaches anyone.
    for (const dir of ['war-game', 'chess-game']) {
      const block = headers.split(`/${dir}/index.html`)[1] ?? '';
      expect(block.slice(0, 200), dir).toContain('must-revalidate');
      expect(block.slice(0, 200), dir).not.toContain('immutable');
    }
  });

  it('allows the chess game to reach the bucket its armies live in', () => {
    const csp = headers.split('Content-Security-Policy-Report-Only:')[1]?.split('\n')[0] ?? '';
    const connect = csp.split('connect-src')[1] ?? '';
    expect(connect).toContain('https://r2-pub.rork.com');
  });
});
