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
  'street-slayer': 'street-slayer-game',
  trenchstar: 'trenchstar-game',
};

/**
 * Every sandbox flag the HTML spec defines.
 *
 * A token outside this set is not a weaker grant, it is a typo — the browser
 * drops it and logs a parse error for the whole attribute on every frame load.
 */
const SANDBOX_FLAGS = [
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-orientation-lock',
  'allow-pointer-lock',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-presentation',
  'allow-same-origin',
  'allow-scripts',
  'allow-storage-access-by-user-activation',
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
  'allow-top-navigation-to-custom-protocols',
];

/**
 * Every `.ts`/`.tsx` file under `src/`, for checks that have to see JSX written
 * by hand rather than the constants it should have used.
 *
 * `src/test` is skipped: this file's own regex literals would match themselves.
 */
const sourceFiles = (dir = repo('src')): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'test' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });

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

  it('grants only sandbox flags that exist', () => {
    // `allow-fullscreen` sat here for months. It reads like a flag, but the
    // spec has no such token — fullscreen is a permissions-policy feature and
    // comes from the `allow` attribute, which every entry already sets. The
    // only symptom was a parse error in the console on every game load, which
    // is exactly the kind of thing nobody goes looking for.
    for (const token of ARCADE_SANDBOX.split(/\s+/).filter(Boolean)) {
      expect(SANDBOX_FLAGS, `ARCADE_SANDBOX: '${token}' is not a sandbox flag`).toContain(token);
    }
  });

  it('holds hand-written frames to the same contract', () => {
    // The jungle and war launchers spell their sandbox out in JSX instead of
    // importing the constant, which is how one bad token survived in three
    // places at once. Scanned at the source so any new frame is covered too,
    // and so a launcher that later switches to ARCADE_SANDBOX just drops out
    // of the scan rather than failing it.
    for (const file of sourceFiles()) {
      const where = file.slice(repo().length + 1);
      for (const [, value] of readFileSync(file, 'utf8').matchAll(/\bsandbox="([^"]*)"/g)) {
        for (const token of value.split(/\s+/).filter(Boolean)) {
          expect(SANDBOX_FLAGS, `${where}: '${token}' is not a sandbox flag`).toContain(token);
        }
        expect(value, `${where} grants allow-same-origin`).not.toContain('allow-same-origin');
      }
    }
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
      // `url` is optional now: Street Slayer was commissioned rather than
      // found, so it has no public repository. What is NOT optional is being
      // attributable — a game names either the repo it came from or the people
      // who wrote it, and always the licence file shipped for it.
      if (game.credit.url !== undefined) expect(game.credit.url, game.slug).toMatch(/^https:\/\//);
      expect(Boolean(game.credit.url || game.credit.author), `${game.slug} names a source`).toBe(true);
      expect(game.credit.licence, game.slug).toBeTruthy();
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

  it('ships a share card for the grid and for every game', () => {
    // The card is named in three places that cannot see each other — the
    // worker's OG_CARD_ROUTES, the page's SEOHead, and the file itself — and a
    // missing file is invisible: the worker falls back to the shared image and
    // the page just shares the wrong picture. So assert the file, and assert
    // the worker still claims the route.
    const worker = readFileSync(repo('CLOUDFLARE_WORKER_SEO.js'), 'utf8');
    // Scoped to the Set's own body: bare 'arcade' also appears in SYSTEM_ROUTES
    // and SSR_STATIC_ROUTES, so a file-wide search would pass while the card
    // route was missing.
    const ogRoutes = worker.match(/const OG_CARD_ROUTES = new Set\(\[([\s\S]*?)\]\)/)?.[1];
    expect(ogRoutes, 'OG_CARD_ROUTES not found in the worker').toBeTruthy();

    const cards = ['arcade', ...ARCADE_GAMES.map((g) => `arcade/${g.slug}`)];
    for (const key of cards) {
      const file = repo('public', 'og', `${key.replace(/\//g, '-')}.jpg`);
      expect(existsSync(file), `public/og/${key.replace(/\//g, '-')}.jpg`).toBe(true);
      expect(statSync(file).size, `${key} card is unexpectedly empty`).toBeGreaterThan(10_000);
      expect(ogRoutes, `OG_CARD_ROUTES is missing '${key}'`).toContain(`'${key}'`);
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
    // Vendored as an engine export nobody here can rebuild, so its exit is a
    // chip added to the page rather than anything inside the bundle.
    'street-slayer': 'street-slayer-game/index.html',
    // Vendored as source: one index.html over a vendored three.js, so the exit
    // control lives in the page itself.
    trenchstar: 'trenchstar-game/index.html',
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

  it('keeps the boot screen pointed at engine handles that still exist', () => {
    // Same hazard as the war adapter's `_rawLook` below: the Construct 2 build
    // is vendored as an export nobody here can rebuild, so its boot screen
    // reaches the engine by global name. `cr_getC2Runtime` is where the overlay
    // reads real progress from, and a re-export that stopped publishing it
    // would leave a black screen sitting over a game that had already loaded.
    const html = readFileSync(repo('public/street-slayer-game/index.html'), 'utf8');
    const runtime = readFileSync(repo('public/street-slayer-game/c2runtime.js'), 'utf8');

    for (const name of ['cr_getC2Runtime', 'loadingprogress', 'isloading']) {
      expect(html.includes(name), `boot screen reads ${name}`).toBe(true);
      // Booleans, not toContain: a failed toContain against a 674 KB runtime
      // would print the whole runtime.
      expect(runtime.includes(name), `runtime still publishes ${name}`).toBe(true);
    }

    // The deadline is what makes losing that handle survivable rather than
    // fatal — without it the overlay waits forever on a signal never coming.
    expect(/giveUpAt/.test(html), 'boot screen retires on a deadline too').toBe(true);

    // The wordmark it shows in place of the Construct 2 engine cog.
    const mark = repo('public/street-slayer-game/dehub-loader-wordmark.png');
    expect(existsSync(mark), 'dehub-loader-wordmark.png').toBe(true);
    expect(statSync(mark).size).toBeGreaterThan(2_000);
  });
});

describe('arcade run bridge', () => {
  // A run board is worth exactly as much as the reports the game sends, and
  // every way that bridge can break is silent: the game plays perfectly, the
  // board just never gains a row. So each half is asserted here.

  it('gives every run board a source the host can listen for', () => {
    for (const game of ARCADE_GAMES) {
      if (game.leaderboard?.kind !== 'run') continue;
      expect(game.leaderboard.runSource, `${game.slug} run board needs a runSource`).toBeTruthy();
    }
  });

  it('ships a vendored game that posts the run messages the host expects', () => {
    for (const game of ARCADE_GAMES) {
      const source = game.leaderboard?.runSource;
      if (!source) continue;
      const html = readFileSync(repo('public', GAME_DIRS[game.slug], 'index.html'), 'utf8');

      for (const type of ['run-start', 'run-progress', 'run-end']) {
        expect(html.includes(`"${type}"`) || html.includes(`'${type}'`), `${game.slug} posts ${type}`).toBe(true);
      }
      expect(html, `${game.slug} run bridge names its source`).toContain(source);
      // Gated on being framed, like the exit chip: a standalone deploy has no
      // host to report to and must not spend a timer talking to nobody.
      expect(html.includes('window.parent'), `${game.slug} gates the bridge on being embedded`).toBe(true);
    }
  });

  it('keeps Street Slayer measuring things the engine and the project still have', () => {
    // The bridge reads the Construct 2 runtime by name, across a build nobody
    // here can rebuild. Two different things can go stale and neither says so:
    // the ENGINE handles (a re-export on a different runtime) and the PROJECT's
    // own global (a rename in the .capx). Losing the first stops the board
    // dead; losing the second is worse — every run then reports 0 HP forever
    // and the board looks like it is working.
    const html = readFileSync(repo('public/street-slayer-game/index.html'), 'utf8');
    const runtime = readFileSync(repo('public/street-slayer-game/c2runtime.js'), 'utf8');
    const data = readFileSync(repo('public/street-slayer-game/data.js'), 'utf8');

    for (const name of ['running_layout', 'all_global_vars', 'original_width']) {
      expect(html.includes(name), `run bridge reads ${name}`).toBe(true);
      // Booleans, not toContain: a failed toContain against a 674 KB runtime
      // would print the whole runtime.
      expect(runtime.includes(name), `runtime still exposes ${name}`).toBe(true);
    }

    // The health global, declared by the project rather than the engine. `[1,`
    // is Construct's event-variable block, so this is its declaration and not
    // some string that happens to match.
    expect(html.includes('life_of_p1'), 'run bridge reads life_of_p1').toBe(true);
    expect(data.includes('[1,"life_of_p1"'), 'project still declares life_of_p1').toBe(true);

    // The one layout that is the game. The bridge decides a run has started or
    // ended by comparing against this name, so a renamed layout means either no
    // runs at all or one run that never ends.
    expect(data.includes('["stage",4600,480'), 'project still has the 4600px stage layout').toBe(true);

    // NOT `number_of_complete_stages`. It reads like the metric to rank and it
    // is dead in this build — compared in six places, incremented in none — so
    // a board built on it would never gain a row. The name appears in the
    // bridge's own comment explaining that, which is why this asserts on the
    // READ rather than on the string: a future edit reaching for the obvious
    // variable has to come past this.
    expect(
      /globalVar\(\s*rt\s*,\s*["']number_of_complete_stages["']/.test(html),
      'run bridge does not read the dead stage counter',
    ).toBe(false);
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
      // And the same check for RELATIVE refs, which the site-absolute pattern
      // above walks straight past. The Construct 2 export writes every one of
      // its script tags that way, so without this its entry document was the
      // one entry document in the arcade nothing checked.
      for (const ref of html.matchAll(/(?:src|href)="(?!\/|https?:|data:)([^"]+\.(?:js|css))"/g)) {
        expect(existsSync(repo('public', dir, ref[1])), `${dir} references ${ref[1]}`).toBe(true);
      }
    }
  });
});

describe('arcade touch controls', () => {
  // Two of the three games are pointer-lock-and-WASD upstream and cannot be
  // played on a touchscreen without the adapter each one's index.html carries.
  // Everything those adapters depend on is in another file — a shared layer, a
  // headers rule, and, for the war build, three property names inside a
  // minified bundle nobody here can rebuild. None of it is visible to the
  // compiler, and every failure mode is silent: the game still boots, still
  // looks right, and simply does not move.
  const TOUCH_GAMES = ['war-game', 'jungle-game'];
  const LAYER = 'public/arcade-touch/touch-controls.js';

  it('ships the shared layer both entry documents load', () => {
    expect(existsSync(repo(LAYER)), LAYER).toBe(true);
    for (const dir of TOUCH_GAMES) {
      const html = readFileSync(repo('public', dir, 'index.html'), 'utf8');
      expect(html, `${dir} loads the touch layer`).toContain('/arcade-touch/touch-controls.js');
      // A module entry in an opaque-origin frame is fetched in CORS mode and
      // dropped without a word if the header is missing — the failure this repo
      // has already paid for twice. A classic script cannot fail that way, so
      // the tag is asserted to stay classic.
      expect(
        /<script src="\/arcade-touch\/touch-controls\.js"><\/script>/.test(html),
        `${dir} loads it as a classic script, not a module`,
      ).toBe(true);
    }
  });

  it('keeps the shared layer OUT of the game that draws its own', () => {
    // Street Slayer ships a Touch plugin, an on-screen directional pad and six
    // action buttons of its own, all inside the canvas. Loading the shared
    // layer on top would stack a second set of controls over the first, and
    // both would be live. This is the assertion that says the omission is
    // deliberate rather than forgotten.
    const html = readFileSync(repo('public/street-slayer-game/index.html'), 'utf8');
    expect(html).not.toContain('/arcade-touch/');
  });

  it('leaves a real pointer completely alone', () => {
    // The layer is loaded by every desktop player too, so "does nothing unless
    // asked" is a promise about their experience, not an optimisation.
    const layer = readFileSync(repo(LAYER), 'utf8');
    expect(layer).toContain('(hover: none) and (pointer: coarse)');
    expect(layer, 'mount() bails before touching the DOM').toMatch(
      /if \(!isTouchDevice\(\)\) return null;/,
    );
  });

  it('keeps the war adapter pointed at engine internals that still exist', () => {
    // The single most breakable thing in the arcade. The war game is vendored
    // as a minified build, so its touch adapter reaches into the input object
    // by property name: `_rawLook` because `_onMouseMove` is gated on a pointer
    // lock a WebView never grants, and the pending sets because the real
    // handlers would ask for that lock on every tap. esbuild does not mangle
    // property names, so these read the same in the bundle as in upstream's
    // source — but a rename upstream would be completely silent, and the game
    // would boot, look perfect, and refuse to aim.
    const bundle = readdirSync(repo('public/war-game/assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(repo('public/war-game/assets', f), 'utf8'))
      .join('\n');

    // Booleans, not toContain: a failed toContain against a 1.6 MB bundle
    // prints the whole bundle.
    for (const name of ['_rawLook', '_pendingDown', '_pendingUp']) {
      expect(bundle.includes(name), `war bundle still has ${name}`).toBe(true);
    }
    // And the gamepad path movement rides in on, which is the half that is
    // supposed to be re-vendor-proof.
    expect(bundle.includes('getGamepads'), 'war bundle still polls getGamepads').toBe(true);
    expect(/stick\.moveX/.test(bundle), 'war bundle still sums stick.moveX into movement').toBe(true);
  });

  it('keeps the jungle adapter pointed at walker fields that still exist', () => {
    // Same hazard, different shape: jungle is vendored as SOURCE and re-vendored
    // by copying upstream's src/ straight over the top, so this file is the one
    // most likely to change under the adapter.
    const controller = readFileSync(repo('public/jungle-game/src/player/controller.js'), 'utf8');
    expect(controller, 'walker still reads a plain key map').toContain('this.keys');
    expect(controller, 'walker still exposes yaw').toContain('this.yaw');
    expect(controller, 'walker still exposes pitch').toContain('this.pitch');
    expect(controller, 'walker still has a jump() to queue').toMatch(/jump\(\)\s*\{/);
    // The adapter shadows this to stop a tap capturing a pointer there is no
    // cursor for. If upstream stops asking, the shadow is harmless — but if it
    // moves somewhere else, the tap starts failing again.
    expect(controller).toContain('requestPointerLock');
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

  it('sends it across the WHOLE Construct 2 export, not an assets/ subtree', () => {
    // The two above are Vite builds where only the module entry is fetched in
    // CORS mode. Construct 2 fetches everything that way from an opaque origin
    // — data.js over XHR, every spritesheet with crossOrigin="anonymous", every
    // .ogg on the way to decodeAudioData. Measured on this build in a sandboxed
    // frame: 122 of 127 requests went out `Origin: null`, mode `cors`. A rule
    // narrowed to a subtree here does not half-break the game, it black-frames
    // it, and there is no subtree to narrow to anyway.
    const block = headers.split('/street-slayer-game/*')[1] ?? '';
    expect(block.slice(0, 200)).toContain('Access-Control-Allow-Origin: *');
    // Nothing in the export is content-hashed: the filenames come out of the
    // exporter and a re-export reuses every one, index.html included. Pinning
    // any of it for a year would strand a re-delivered build.
    expect(block.slice(0, 200)).not.toContain('immutable');
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

  it('keeps the touch layer revalidating', () => {
    // Unhashed and loaded by both games, so `immutable` here would mean a fix
    // to the controls never reaching anyone who has already played once —
    // exactly the trap the index.html rules above were split to avoid.
    const block = headers.split('/arcade-touch/*')[1] ?? '';
    expect(block.slice(0, 200)).toContain('must-revalidate');
    expect(block.slice(0, 200)).not.toContain('immutable');
  });

  it('allows the chess game to reach the bucket its armies live in', () => {
    const csp = headers.split('Content-Security-Policy-Report-Only:')[1]?.split('\n')[0] ?? '';
    const connect = csp.split('connect-src')[1] ?? '';
    expect(connect).toContain('https://r2-pub.rork.com');
  });
});
