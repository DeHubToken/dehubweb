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

## The two local changes

Both are in `index.html` and both are commented in place:

1. **The import map points at `./vendor/three.module.js`** instead of jsDelivr.
   Same build (three 0.170.0), served from this origin — no third-party request
   from a user's session, and no CDN outage that can break the page. The version
   is pinned: the game targets r170 and the parent app is on 0.181.
2. **A progress bridge.** The engine generates every mesh, texture and sound on
   the device before it renders anything, so the launcher needs to distinguish
   "still building" from "dead". The bridge posts `ready` / `tick` / `error` to
   the parent and only observes public DOM and globals — it patches nothing the
   engine owns.

Nothing under `src/` is modified. Re-vendoring is therefore a straight copy:

```bash
git clone https://github.com/StarKnightt/jungle-trail.git
```

Then replace `src/` here with upstream's `src/`, and re-apply nothing — the two
changes above live only in `index.html`.

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
sandboxed iframe (`allow-scripts allow-pointer-lock allow-fullscreen`) with
`allow-same-origin` deliberately withheld, so the game runs in an opaque origin
and cannot reach app storage, cookies or DOM. The game uses no storage APIs at
all, so nothing is lost by that.

Set `VITE_JUNGLE_GAME_URL` to point the launcher somewhere else, for example a
standalone deploy. When unset it defaults to this vendored copy.
