# jungle-game (vendored)

This directory holds a copy of **Jungle Trail**, a first-person walk through a
procedurally generated rainforest built on Three.js. It is embedded by the
Jungle theme's game launcher
(`src/components/app/jungle/JungleGameLauncher.tsx`).

- Upstream: https://github.com/StarKnightt/jungle-trail
- Licence: MIT, Copyright (c) 2026 Prasenjit (StarKnightt). Full text in
  `LICENSE-JungleTrail` at the repo root.
- Vendored from commit `998b89d7c52fdf51e0f96615742e45e05063e8d6`

## Why the source and not a build

Unlike the War game, there is nothing to build: upstream ships plain ES modules
with an import map and no bundler at all (`package.json` has no build script —
only a static file server and a Playwright screenshot tool, both dev-only).
Vite copies `public/` verbatim into `dist/`, so the source *is* the deployable
artefact. Copying it as-is also keeps the diff against upstream readable, which
matters for a 38-file, ~12k-line dependency.

`tools/` and `media/` are deliberately **not** vendored — a Playwright capture
harness and 660 KB of screenshots are not needed to play the game, and they
would ship to every visitor of the site.

## The four local changes

All four are in `index.html` and all are commented in place:

1. **The import map points at `./vendor/three.module.js`** instead of jsDelivr.
   Same build (three 0.170.0), served from this origin — no third-party request
   from a user's session, and no CDN outage that can break the page. The version
   is pinned: the game targets r170 and the parent app is on 0.181.
2. **A readiness bridge.** The engine generates every mesh, texture and sound on
   the device before it renders anything, so the launcher needs to distinguish
   "still building" from "dead". The bridge posts `ready` / `error` to the parent
   and only observes public DOM and globals — it patches nothing the engine owns.
   It reports no progress, because there is none to report: the world is built
   inside one synchronous constructor. The launcher's percentage bar is modelled
   against a clock instead (`src/lib/game-boot-progress.ts`).

3. **An Escape panel.** Upstream has no menu of any kind — the stylesheet says
   so in as many words, and Escape only hands the mouse back. Standalone that is
   right; embedded it left no way out at all, because a keydown in the frame
   never reaches the host document and the host's exit control cannot be aimed
   at while the walk holds the pointer. The panel is hidden until Escape is
   pressed, is only wired up when `window.parent !== window`, and offers exactly
   two choices: keep walking, or leave. Leaving releases the pointer lock and
   posts `{ source: 'jungle-game', type: 'exit' }` to the parent — see
   `src/lib/game-exit-request.ts`.

4. **Touch controls.** Upstream is mouse-and-keyboard only, and not by
   omission: `src/player/controller.js` is `requestPointerLock` plus
   `mousemove` for the head and `keydown`/`keyup` for the legs, with no touch
   handler anywhere. A phone therefore finished the bake and stood in a
   rainforest it could not move in — and the arcade's native app is a WebView,
   which is never granted pointer lock, so a keyboard would not have helped
   either. The adapter here drives the fields the keyboard and mouse already
   drive (`walker.keys`, `walker.yaw`, `walker.pitch`, `walker.jump()`) rather
   than simulating events at them, and it shadows `canvas.requestPointerLock`
   with a no-op so a tap does not try to capture a pointer there is no cursor
   for. The stick and the buttons themselves are **not** in this directory —
   see below.

Nothing under `src/` is modified. Re-vendoring is therefore a straight copy:

```bash
git clone https://github.com/StarKnightt/jungle-trail.git
```

Then replace `src/` here with upstream's `src/`, and re-apply nothing — all four
changes above live only in `index.html`.

## The touch layer is not in here

Change 4 above is only the ~60-line adapter. The stick, the drag surface, the
buttons and their multitouch handling are shared with the war game and live in
`public/arcade-touch/touch-controls.js`.

That is deliberate, and it is because of the line above: re-vendoring this
directory is a straight copy of upstream's `src/`, and anything of ours sitting
inside it is one `cp -r` away from being deleted. Outside, it survives — and a
fix to how the stick feels is made once rather than twice.

**If the walker stops responding to touch after a re-vendor**, check
`src/player/controller.js` first: the adapter depends on `keys` still being a
plain map the input loop reads each frame, and on `yaw`/`pitch` still being
plain numbers on the walker. Both are read directly, so a rename is silent.

## Quality

The engine reads its settings from the URL **hash**, not the query string:

- `#tier=low|medium|high|ultra` pins a quality tier
- `#fps=<n>` sets the frame cap (default 60)

Pinning a tier also **disables the engine's own adaptive downgrade**, so the
launcher only pins on hardware it is confident about (coarse pointer, small
viewport, integrated or software GPU) and otherwise leaves the game to start at
`high` and adapt itself.

## Serving

Files here are copied verbatim into `dist/` by Vite and served from
`/jungle-game/index.html` on the app's own origin. The launcher loads it in a
sandboxed iframe (`allow-scripts allow-pointer-lock`) with
`allow-same-origin` deliberately withheld, so the game runs in an opaque origin
and cannot reach app storage, cookies or DOM. The game uses no storage APIs at
all, so nothing is lost by that.

Set `VITE_JUNGLE_GAME_URL` to point the launcher somewhere else, for example a
standalone deploy. When unset it defaults to this vendored copy.
