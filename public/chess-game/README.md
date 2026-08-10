# chess-game (vendored build)

This directory holds a **prebuilt** copy of King's Gambit, a cinematic 3D chess
game built on Three.js and chess.js, with a negamax engine in a Web Worker. It
is embedded by the Arcade (`src/pages/ArcadeGamePage.tsx`, registry entry
`kings-gambit` in `src/config/arcade-games.ts`).

- Upstream: https://github.com/alexngdev99/rork-medieval-3d-chess
- Licence: MIT, Copyright (c) 2026 King's Gambit contributors. Full text in
  `LICENSE-KingsGambit` at the repo root.
- Vendored from commit `2f481a4ea7558e93d3e63510981fca4fbd834c79`

## Why the built output and not the source

Same reason as the War game. Upstream is a separate Vite app on React 19 and
Three.js r185 while this app is on React 18 and 0.181, and its search engine
ships as a Web Worker. Vendoring the build keeps the two dependency trees from
ever meeting, keeps ~1.5 MB of game code out of the app's entry bundle (it is
fetched only when someone opens the game), and leaves the upstream repo as the
single source of truth for the code.

## The 3D assets are NOT in this directory

The armies, weapons and score are ~44 MB of glTF and audio, and the game fetches
them at runtime from **`https://r2-pub.rork.com`**, upstream's bucket. That is a
third-party dependency in a user's session, and it is a deliberate trade: 44 MB
of binaries in git for every clone, forever, against a bucket we do not control.

What makes it tolerable is that the failure is graceful, not fatal. Every roster
download is individually caught (`scene/pieces.ts`, `download()`), retried four
times with backoff (`scene/gltfQueue.ts`), and anything still missing falls back
first to the other army's sculpt and then to a procedurally built figure. With
the bucket entirely unreachable the game still boots, still plays, and still
looks like chess — it just loses the sculpted characters. That was verified by
running the build with the asset base pointed at a dead host.

`connect-src` in `public/_headers` must therefore include `r2-pub.rork.com`.

**If that bucket ever dies**, the fix is to localise the assets rather than
patch around them:

```bash
# From the upstream checkout, list every asset the game references:
grep -oE 'https://r2-pub\.rork\.com/[^"`]+' web/src/assets/generated.ts
# …plus the ${MODEL_BASE}/… and ${CRY_BASE}/… template literals in the same file.
```

Download them into `public/chess-game/media/`, then repoint `MODEL_BASE` and
`CRY_BASE` in `web/src/assets/generated.ts` at `./media` and rebuild. Keep that
as a fourth patch under `patches/` if it happens.

## Rebuilding after an upstream change

```bash
git clone https://github.com/alexngdev99/rork-medieval-3d-chess.git
cd rork-medieval-3d-chess
git apply ../dehubweb/public/chess-game/patches/*.patch   # see below; paths are web/…
cd web
npm install
npx vite build --base=/chess-game/ --sourcemap false
```

Then replace `index.html`, `assets/` and `favicon.png` here with the resulting
`dist/`. Do **not** copy `dist/icon.png` (2.5 MB apple-touch-icon), `banner.jpg`
(upstream's share card), `robots.txt` or `placeholder.svg` — an iframe uses none
of them, and the first two alone are 2.9 MB.

The `--base=/chess-game/` flag is required: without it the built asset URLs are
absolute to `/` and 404 when served from this subpath.

## The four local patches

They live in `patches/` so re-vendoring is mechanical. Each is also commented in
place in the patched file, so anyone reading the upstream source in a checkout
sees why the line looks odd.

### `01-inline-worker.patch` — the search worker must survive an opaque origin

The launcher frames this build **without `allow-same-origin`**, so the document
runs in an opaque origin. Upstream loads the engine by URL:

```js
new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" })
```

Chromium refuses that outright — *"Script at '…/engine.worker.js' cannot be
accessed from origin 'null'"* — and refuses a **module** worker from a blob too,
because module scripts are always fetched in CORS mode. A **classic** worker
from a blob is the one form that survives, so the patch switches the import to
Vite's `?worker&inline`, which compiles to exactly that.

Without this the game boots and renders and simply never moves: the computer
"thinks" forever. All three behaviours above were measured in Chromium against
this build, not inferred.

### `02-subpath-route.patch` — the game is served from a subpath

Upstream mounts the game at `path="/"` with a NotFound catch-all. Served from
`/chess-game/index.html`, the catch-all won and the iframe rendered "Oops! Page
not found". The game is a single screen with no routes of its own, so the patch
lets any path render it — which also leaves upstream's dev server at `/` working.

### `03-frame-head.patch` — drop the standalone site's share card

Upstream's `<head>` carries og/twitter tags absolute to its own deploy at
`g9111r67kl6tq85g540sd-web.rork.live`. This document is never shared directly —
`/arcade/kings-gambit` is the shareable, indexable surface and carries its own
metadata — so the block is dropped, `noindex` is added, and the icon reference is
made relative so it does not resolve to dehub.io's favicon.

### `04-host-exit.patch` — a way out from inside the game

The host paints an exit control over the frame, and it is not always reachable:
the arcade player is a full-viewport surface and a player who has just opened
settings is looking at the game's own panel, not at our chrome. So the settings
panel grows a "Close the game" button that posts
`{ source: 'chess-game', type: 'exit' }` to the parent, which is the only channel
an opaque-origin frame has. The host listens in `src/lib/game-exit-request.ts`.

The button is only rendered when `window.parent !== window`, so upstream's
standalone deploy — where there is nothing to return to — is unaffected.

Google Fonts (Cinzel, Crimson Pro) is left as upstream ships it. The app already
loads Google Fonts and the CSP already allows it, so self-hosting here would be
divergence without a benefit.

## Serving

Files here are copied verbatim into `dist/` by Vite and served from
`/chess-game/index.html` on the app's own origin. The player loads it in a
sandboxed iframe (`allow-scripts allow-pointer-lock allow-fullscreen`) with
`allow-same-origin` deliberately withheld, so the game runs in an opaque origin
and cannot reach app storage, cookies or DOM. Every one of its `localStorage`
calls is already wrapped in `try/catch` upstream, so losing storage costs it
nothing but remembered preferences.

Because the frame is opaque-origin, its `<script type="module">` entry is
fetched in CORS mode with `Origin: null` — hence the
`Access-Control-Allow-Origin: *` block for `/chess-game/*` in `public/_headers`.
Without it the browser drops the script silently: no error, no console output,
just a black frame. (Same failure the War game hit; see the comment there.)

Set `VITE_CHESS_GAME_URL` to point the player somewhere else, for example a
standalone deploy of the game. When unset it defaults to this vendored copy.
