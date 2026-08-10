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

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

describe('arcade exit bridge', () => {
  // The close button lives inside each game's own settings/pause menu and its
  // only channel to the host is postMessage — an opaque-origin frame has no
  // other. Three things have to line up for that to work, across a vendored
  // build the compiler never sees: the registry's `exitSource`, the string the
  // game posts, and the fact that the button is gated on being embedded. A
  // mismatch is silent — the button just does nothing — so it is asserted here.
  const GAME_ENTRY: Record<string, string> = {
    'kings-gambit': 'chess-game/assets',
    'claude-of-duty': 'war-game/assets',
    // Vendored as source, so the panel lives in the page itself.
    'jungle-trail': 'jungle-game/index.html',
  };

  it('gives every game an exit source', () => {
    for (const game of ARCADE_GAMES) {
      expect(game.exitSource, game.slug).toBeTruthy();
    }
  });

  it('ships a vendored game that posts the exact source the host listens for', () => {
    for (const game of ARCADE_GAMES) {
      const target = repo('public', GAME_ENTRY[game.slug]);
      const files = statSync(target).isDirectory()
        ? readdirSync(target).map((f) => resolve(target, f))
        : [target];
      const haystack = files.map((f) => readFileSync(f, 'utf8')).join('\n');

      // Quote style is whatever the minifier felt like — the chess build emits
      // backticks and the war build double quotes — so match any of the three.
      // And assert on a boolean rather than with `toContain`, because a failed
      // `toContain` against a 1.6 MB bundle prints the entire bundle.
      const q = "['\"`]";
      const posts = new RegExp(`source:\\s*${q}${game.exitSource}${q}`).test(haystack);
      const asExit = new RegExp(`type:\\s*${q}exit${q}`).test(haystack);
      // Gated on being framed, so upstream's standalone deploy — which has
      // nothing to return to — never grows a dead button.
      const gated = haystack.includes('window.parent');

      expect(posts, `${game.slug} posts source "${game.exitSource}"`).toBe(true);
      expect(asExit, `${game.slug} posts type "exit"`).toBe(true);
      expect(gated, `${game.slug} gates the button on being embedded`).toBe(true);
    }
  });
});

describe('arcade readiness bridge', () => {
  it('keeps the bridge in the entry document of every game that declares one', () => {
    // Regression guard, and it has already earned its place. Two of the
    // vendored games carry a hand-written readiness script in their own
    // index.html — a *page* change, not a source patch, so a rebuild does not
    // reproduce it. Copying a fresh `dist/index.html` over the vendored one
    // deletes it, and the only symptom is a boot readout that runs to its
    // three-minute cap over a game that is already playable. That is a slow,
    // easily-missed failure; this is a fast one.
    for (const game of ARCADE_GAMES) {
      if (!game.readySource) continue;
      const html = readFileSync(repo('public', GAME_DIRS[game.slug], 'index.html'), 'utf8');
      expect(html, `${game.slug} index.html posts its ready source`).toContain(game.readySource);
      expect(html, `${game.slug} index.html still has a bridge`).toContain('postMessage');
    }
  });

  it('points each entry document at a bundle that exists', () => {
    // The other half of the same hazard: the hash in `<script src>` is edited
    // by hand when a game is re-vendored, so a typo or a forgotten edit leaves
    // the frame asking for a chunk that is not there — a blank game.
    for (const game of ARCADE_GAMES) {
      const dir = GAME_DIRS[game.slug];
      const html = readFileSync(repo('public', dir, 'index.html'), 'utf8');
      for (const ref of html.matchAll(/(?:src|href)="\/([^"]+\.(?:js|css))"/g)) {
        expect(existsSync(repo('public', ref[1])), `${dir} references ${ref[1]}`).toBe(true);
      }
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
