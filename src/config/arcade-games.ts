/**
 * The Arcade registry.
 * ====================
 * One entry per playable game, and the single source of truth behind
 * `/arcade` (the grid) and `/arcade/:slug` (the player).
 *
 * WHY A REGISTRY AT ALL
 * ---------------------
 * Before the Arcade there was no list. Each game was hard-wired to exactly one
 * theme — Claude of Duty to `war`, Jungle Trail to `jungle` — and reachable
 * only by switching to that theme and then pressing an arrow key at the right
 * moment. Nothing enumerated them, so nothing could show them together, and a
 * player who never touched the theme picker had no way to learn either game
 * existed. King's Gambit is bound to no theme at all and would have had nowhere
 * to live.
 *
 * So the Arcade is the front door and this file is its index. The theme
 * launchers keep working exactly as they did — the arrow-key offer inside the
 * War and Jungle themes is a nice piece of stagecraft and stays — but they are
 * now a second way in, not the only one.
 *
 * WHAT AN ENTRY OWNS
 * ------------------
 * Everything about a game that is not the game: its copy, its art, its credit,
 * and the two things that differ per engine — how its URL is built (each reads
 * its settings differently, and one of them reads them from the *hash*), and
 * how long its boot takes, which is what the progress readout is modelled
 * against. The player component knows none of that.
 *
 * ADDING A GAME
 * -------------
 * Vendor the build under `public/<slug>-game/` with a README recording the
 * upstream and the commit, add its licence at the repo root, add the
 * `Access-Control-Allow-Origin` block to `public/_headers` if the frame is
 * sandboxed (it must be), then add an entry here. Nothing else needs editing —
 * the grid, the routes and the SEO all read this list. `src/test/arcade.test.ts`
 * holds the contract to the parts that live outside it.
 */

import { isWeakHardware, probeGpu, readRenderer } from '@/lib/game-gpu';

/**
 * Provenance bookkeeping, NOT page copy.
 *
 * This is deliberately not rendered anywhere. Attribution is satisfied in the
 * repo — the full licence text sits at the root and each vendored build's
 * README records its upstream and pinned commit — and the games are expected to
 * change substantially, so a card that named a specific upstream project would
 * go stale and misattribute. What this is still for: keeping each game tied to
 * the licence file we actually ship, which `src/test/arcade.test.ts` asserts.
 */
export interface ArcadeGameCredit {
  /** Upstream project name, as its authors write it. */
  name: string;
  /** Upstream repository. */
  url: string;
  /** SPDX-ish short name. Every game here is MIT so far. */
  licence: string;
  /** Full licence text in the repo. The test checks this file exists. */
  licenceFile: string;
}

/** What the host must tell the player before it hands over the viewport. */
export interface ArcadeGameCapability {
  ok: boolean;
  /** Short, shouty reason. Rendered as the panel's kicker. */
  reason: string;
  /** A sentence a non-technical player can act on. */
  detail: string;
}

export interface ArcadeGame {
  /** URL segment under /arcade, and the key everything else joins on. */
  slug: string;
  title: string;
  /** One line, card-sized. */
  tagline: string;
  /**
   * One sentence, and deliberately kept to roughly the same length as every
   * other entry's — the cards sit in one grid row, so a description that runs
   * two lines longer than its neighbours is visible as a ragged block even
   * though the buttons still line up. Keep new entries in the same band.
   * Doubles as the meta description for /arcade/<slug>.
   */
  description: string;
  /** Verb for the card's button — these are different kinds of game. */
  action: string;
  /** Card art: a real capture from the game, not marketing material. */
  art: string;
  /** Alt text for the art. */
  artAlt: string;
  credit: ArcadeGameCredit;
  /**
   * Resolve the frame URL, including any engine settings. Called once, when
   * the player mounts — calling it again on a re-render would reload the
   * iframe and restart the boot from zero.
   */
  buildUrl: () => string;
  /**
   * Time constant for the modelled progress bar, in ms. See
   * `lib/game-boot-progress`: this is not a measurement, it is a shape chosen
   * so the bar is past 60% at the fast end of the observed boot and past 90%
   * at the slow end.
   */
  bootTauMs: number;
  /**
   * The game paints its own loading screen early enough that the host's boot
   * readout only ever appears ON TOP of it — two progress bars for one boot.
   * With this set the host draws no readout at all and the game speaks for
   * itself; the brief black beat before its first paint is the whole cost.
   */
  hasOwnBootScreen?: boolean;
  /**
   * `postMessage({ source })` value the frame uses to report readiness, when it
   * reports at all. Games with a loading screen of their own do not need one:
   * the player just reveals the frame and lets the game speak for itself.
   */
  readySource?: string;
  /**
   * `postMessage({ source })` value the frame uses to ask to be closed, from a
   * button inside its own settings or pause menu. Every game here has one,
   * because the host's corner link cannot be clicked while a pointer lock is
   * held — see lib/game-exit-request. Same name as `readySource` where a game
   * has both; kept separate so a game can have one bridge without the other.
   */
  exitSource?: string;
  /** Extra `allow` permissions beyond the baseline. */
  allow: string;
  /** Preflight for this engine specifically. */
  checkCapability: () => ArcadeGameCapability;
  /**
   * Where this game's online-multiplayer surface lives, for the game that has
   * one. The card grows a second, quieter button; games without the field are
   * untouched.
   */
  onlineHref?: string;
}

/**
 * Vendored builds under `public/`. Each is overridable with an env var so a
 * game can be pointed at a standalone deploy without a code change; unset, the
 * app serves its own copy and works out of the box.
 */
const CHESS_URL = (import.meta.env.VITE_CHESS_GAME_URL as string | undefined) || '/chess-game/index.html';
const WAR_URL = (import.meta.env.VITE_WAR_GAME_URL as string | undefined) || '/war-game/index.html';
const JUNGLE_URL = (import.meta.env.VITE_JUNGLE_GAME_URL as string | undefined) || '/jungle-game/index.html';

/**
 * Shared preflight for the two engines that are WebGL2-only and heavy.
 *
 * An unknown renderer passes. The extension that exposes it is withheld by
 * some browsers, and blocking on "we could not tell" would lock out machines
 * that run these games perfectly well.
 */
function requireHardwareWebgl(what: string, needsWebgl2: boolean): ArcadeGameCapability {
  const gpu = probeGpu();

  if (!gpu.webgl) {
    return {
      ok: false,
      reason: 'NO WEBGL',
      detail:
        'This browser is not giving any page a WebGL context. Hardware acceleration is most likely switched off in the browser settings.',
    };
  }
  if (needsWebgl2 && !gpu.webgl2) {
    return {
      ok: false,
      reason: 'WEBGL2 UNAVAILABLE',
      detail: `This browser reports WebGL 1 only, and ${what} requires WebGL 2. Updating the browser or the graphics driver usually resolves it.`,
    };
  }
  if (gpu.software) {
    return {
      ok: false,
      reason: 'SOFTWARE RENDERING',
      detail: `The GPU is not being used (${gpu.renderer}). ${what} would run at a few frames per second. Enable hardware acceleration in the browser settings, then restart it.`,
    };
  }

  return { ok: true, reason: '', detail: gpu.renderer };
}

export const ARCADE_GAMES: ArcadeGame[] = [
  {
    slug: 'kings-gambit',
    title: "King's Gambit",
    tagline: 'Cinematic 3D chess. Three civilisations, one board.',
    description:
      'Chess with an army behind every piece. Three rigged civilisations march, strike and fall across a marble board in four battlegrounds, at three engine strengths.',
    action: 'Play',
    art: '/arcade/kings-gambit.webp',
    artAlt: "Two armies of sculpted 3D chess figures facing each other across a lit board in King's Gambit",
    credit: {
      name: "King's Gambit",
      url: 'https://github.com/alexngdev99/rork-medieval-3d-chess',
      licence: 'MIT',
      licenceFile: 'LICENSE-KingsGambit',
    },
    // The engine reads no settings from the URL: it detects a quality preset
    // itself, steps down on sustained bad frame times, and remembers the
    // player's override. There is nothing useful to pass in.
    buildUrl: () => CHESS_URL,
    // The game has a real loading screen with a real count ("carving 3 of 6
    // figures"), driven by actual download completions, and it paints within
    // a couple of seconds. The host's modelled bar only ever landed on top of
    // it — two progress readouts for one boot — so the host draws none here.
    // tau kept for the field's shape; nothing reads it while the flag is set.
    bootTauMs: 6000,
    hasOwnBootScreen: true,
    exitSource: 'chess-game',
    // Pointer lock is not requested: the board is driven by clicks and an orbit
    // drag, and grabbing the cursor would only make it harder to aim at a square.
    allow: 'fullscreen; autoplay',
    // Softer than the other two on purpose. This engine has a documented
    // fallback the others do not: if the sculpts cannot be had it builds the
    // figures procedurally and plays on, so a weak GPU degrades instead of
    // failing. WebGL2 is still required — it will not start without one.
    checkCapability: () => requireHardwareWebgl("King's Gambit", true),
    onlineHref: '/arcade/kings-gambit/online',
  },
  {
    slug: 'claude-of-duty',
    title: 'Claude of Duty',
    tagline: 'A browser FPS with every asset generated at boot.',
    description:
      'A first-person shooter that ships no art at all: every mesh, texture, weapon and sound is generated in JavaScript on your machine while the level loads.',
    action: 'Deploy',
    art: '/arcade/claude-of-duty.webp',
    artAlt: 'First-person view down a weapon across the procedurally generated terrain of Claude of Duty',
    credit: {
      name: 'Claude of Duty',
      url: 'https://github.com/mshumer/Claude-of-Duty',
      licence: 'MIT',
      licenceFile: 'LICENSE-ClaudeOfDuty',
    },
    /**
     * `q=` picks the preset; the engine defaults to "ultra" when it is absent,
     * and ultra is what made first load take the better part of a minute on a
     * black screen. `prewarm=0` is not an optimisation but a hang fix — see the
     * long note in WarGameLauncher, which owns this URL's history.
     */
    buildUrl: () => {
      const sep = WAR_URL.includes('?') ? '&' : '?';
      const renderer = readRenderer();
      const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency ?? 4;
      let q: string;
      if (isWeakHardware(renderer)) q = 'low';
      else if (cores <= 4) q = 'low';
      else if (cores <= 8) q = 'medium';
      // Unknown GPU lands on medium rather than high: guessing low costs some
      // fidelity, guessing high costs playability, and that is not symmetric.
      else q = renderer ? 'high' : 'medium';
      return `${WAR_URL}${sep}q=${q}&prewarm=0`;
    },
    // 25-60s of procedural baking with no loading UI of its own, and it renders
    // black throughout. Without a readout that is indistinguishable from a
    // crash, which is exactly how it was first reported.
    bootTauMs: 22000,
    readySource: 'war-game',
    exitSource: 'war-game',
    allow: 'pointer-lock; fullscreen; gamepad; autoplay',
    checkCapability: () => requireHardwareWebgl('The game', true),
  },
  {
    slug: 'jungle-trail',
    title: 'Jungle Trail',
    tagline: 'Walk a rainforest that is built the moment you arrive.',
    description:
      'A first-person walk through a procedurally generated rainforest — a hundred thousand plants, weather and a day cycle, all grown on your machine as you arrive.',
    action: 'Walk in',
    art: '/arcade/jungle-trail.webp',
    artAlt: 'A path through dense procedurally generated rainforest canopy in Jungle Trail',
    credit: {
      name: 'Jungle Trail',
      url: 'https://github.com/StarKnightt/jungle-trail',
      licence: 'MIT',
      licenceFile: 'LICENSE-JungleTrail',
    },
    /**
     * Settings go in the HASH, not the query string — that is where this engine
     * reads them (`new URLSearchParams(location.hash.slice(1))`). `?tier=low`
     * is silently ignored, which is the kind of bug that looks like "the
     * quality setting does nothing".
     *
     * Pinning is a last resort: it also switches OFF the engine's own adaptive
     * downgrade, which is better than anything guessable from out here because
     * it watches real frame times. So pin only where the hardware is not in
     * doubt, and otherwise let the game open at `high` and find its own level.
     */
    buildUrl: () => (isWeakHardware() ? `${JUNGLE_URL}#tier=low` : JUNGLE_URL),
    // The world is built inside one synchronous constructor, so there is no
    // progress to report from inside — the vendored index.html posts `ready`
    // and nothing else, and this bar is modelled against a clock instead.
    bootTauMs: 14000,
    readySource: 'jungle-game',
    exitSource: 'jungle-game',
    allow: 'pointer-lock; fullscreen; autoplay',
    // WebGL 1 is enough here: the engine targets r170 and does not require a
    // WebGL2 context.
    checkCapability: () => requireHardwareWebgl('The walk', false),
  },
];

export function getArcadeGame(slug: string | undefined): ArcadeGame | undefined {
  return ARCADE_GAMES.find((game) => game.slug === slug);
}

/**
 * Baseline sandbox for every arcade frame.
 *
 * `allow-same-origin` is deliberately absent, and must stay absent. Every game
 * here is third-party code served from this app's own origin, so granting it
 * would hand that code real access to app storage, cookies and the parent DOM.
 * Withholding it forces an opaque origin instead.
 *
 * Two consequences worth knowing before touching this, both learned the hard
 * way and both documented in the vendoring READMEs: a module `<script>` entry
 * in an opaque-origin frame is fetched with `Origin: null` and needs an
 * `Access-Control-Allow-Origin` header or the browser drops it silently, and a
 * URL-addressed Web Worker cannot be constructed at all (which is why the
 * chess build inlines its engine).
 */
export const ARCADE_SANDBOX = 'allow-scripts allow-pointer-lock allow-fullscreen';
