# war-game (vendored build)

This directory holds a **prebuilt** copy of Claude of Duty, a browser FPS built
on Three.js with procedurally generated assets. It is embedded by the War
theme's game launcher (`src/components/app/war/WarGameLauncher.tsx`).

- Upstream: https://github.com/mshumer/Claude-of-Duty
- Licence: MIT, Copyright (c) 2026 mshumer. Full text in `LICENSE-ClaudeOfDuty`
  at the repo root.
- Vendored from commit `d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853`

Upstream's `package.json` declares `ISC` while its `LICENSE` file is MIT. The
`LICENSE` file governs, and it is what GitHub reports for the repository.

## Why the built output and not the source

The game is a separate ~55k line Vite app targeting Three.js r180, while this
app is on 0.181. Vendoring the build keeps the two dependency trees from ever
meeting, keeps roughly 1.6 MB of game code out of the app's entry bundle
(it is fetched only when a player actually deploys), and leaves the upstream
repo as the single source of truth for the code itself.

## The three local changes

### 1. `patches/01-host-exit.patch` — a Leave Game button

Adds a **Leave Game** button to the engine's own
pause menu (`src/ui/menu.js`, the Escape overlay), beside Resume and Defaults.

It is not a convenience. The frame is sandboxed without `allow-same-origin`, so
a keydown in the game never reaches the host document — the launcher's own
Escape handler cannot see it — and while the game holds a pointer lock there is
no cursor with which to aim at the exit control layered over the frame. Before
this, a player whose Escape did not reach the host had the browser's back button
and nothing else.

The button posts `{ source: 'war-game', type: 'exit' }` to the parent, which is
the only channel an opaque-origin frame has; the host listens in
`src/lib/game-exit-request.ts`. It is only created when
`window.parent !== window`, so upstream's standalone deploy is unaffected.

### 2. A readiness bridge, in `index.html`

`index.html` here is **not** the build's output verbatim. It carries an ~80 line
passive script that polls the engine's own `window.__READY__` and posts
`{ source: 'war-game', type: 'ready' }` to the parent, so the host can take its
loading readout down at the right moment rather than leaving a progress bar
sitting over a game that is already playable. The game bakes every texture and
mesh in JS at boot — ~48s in one probe — and ships no loading UI of its own, so
without this the embed looks broken. The script is commented in place.

It is a *page* change rather than a source patch, so it is not in `patches/` and
a rebuild does not produce it.

**Therefore: never copy `dist/index.html` over this file.** Doing so silently
deletes the bridge, and the only symptom is a boot readout that runs to its
three-minute cap over a game you can already hear and see. That is exactly what
happened once while adding the Leave Game button. Instead, copy `dist/assets/`
and then update the one `<script src>` hash in this file by hand.

### 3. Touch controls, also in `index.html`

Upstream is mouse-and-keyboard only: the camera is `requestPointerLock` and
`movementX`/`movementY`, and the single `touchstart` listener in the bundle is a
member of the gesture list that unlocks the audio context, not a control. A
phone reached the end of the bake and stood in a level it could not look around
in — and the arcade's native app is a WebView, which is never granted pointer
lock, so a Bluetooth keyboard would not have rescued it either.

This is a page change for the blunt reason that the game ships here as a
minified build: there is no source in this directory to patch, and this repo has
no way to rebuild one. **It is deleted by the same `dist/index.html` copy that
deletes the bridge, so the warning above covers both.**

It goes in through two doors, and the split is the interesting part:

- **Movement uses the engine's own gamepad path.** `_pollGamepad` reads
  `axes[0..3]` into `stick`, and `moveVector` sums `stick.moveX/moveY` with the
  keyboard — a real, complete input route that was already wired and simply had
  nothing connected to it. The adapter shims `navigator.getGamepads` to report a
  synthetic pad carrying the on-screen stick, so touch arrives as an input the
  engine already understands. It yields to real hardware: with an actual
  controller paired, the real list is returned untouched.
- **Look and the buttons write to the input object directly** (`_rawLook`,
  `_pendingDown`, `_pendingUp`). This is the one place it reaches inside, and it
  is forced: `_onMouseMove` is hard gated on `pointerLocked`, which can never
  become true here, so a synthetic mouse event would be discarded on arrival.
  `_rawLook` is what that handler would have written to, and it is consumed and
  zeroed every frame — so accumulating into it *is* a mouse delta, and it keeps
  the player's own sensitivity and invert-Y settings, which a rate-based right
  stick would have bypassed.

Those are plain property names and esbuild does not mangle them, so they read
the same in the built bundle as in upstream's source. **If touch look or the
buttons go dead after a re-vendor, check those three names first** — they are
read directly, so a rename upstream is silent.

The stick, the drag surface and the buttons themselves are shared with the
jungle game and live in `public/arcade-touch/touch-controls.js`, outside this
directory so that a re-vendor cannot delete them.

## Rebuilding after an upstream change

```bash
git clone https://github.com/mshumer/Claude-of-Duty.git
cd Claude-of-Duty
git apply ../dehubweb/public/war-game/patches/*.patch
npm install
npx vite build --base=/war-game/ --sourcemap false
```

Then replace `assets/` here with the resulting `dist/assets/`, and repoint the
`<script src>` in this directory's `index.html` at the new hash. Do not replace
`index.html` itself — see above.

Building the pinned commit **without** the patch reproduces the previously
vendored `assets/index-BQhdkP8T.js` byte for byte, which is worth knowing: if a
rebuild ever disagrees with what is here, the source moved, not the toolchain.

Then replace the contents of this directory with the resulting `dist/`.

The `--base=/war-game/` flag is required: without it the built asset URLs are
absolute to `/` and 404 when served from this subpath. On Git Bash for Windows,
prefix the command with `MSYS_NO_PATHCONV=1` or the shell rewrites the base into
a Windows path.

## Serving

Files here are copied verbatim into `dist/` by Vite and served from
`/war-game/index.html` on the app's own origin. The launcher still loads it in a
sandboxed iframe (`allow-scripts allow-pointer-lock allow-fullscreen`, with
`allow-same-origin` deliberately withheld), so the game runs in an opaque origin
and cannot reach app storage, cookies or DOM.

Set `VITE_WAR_GAME_URL` to point the launcher somewhere else, for example a
standalone deploy of the game. When unset it defaults to this vendored copy.
