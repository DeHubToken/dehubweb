# chess-game (vendored build)

This directory holds a **prebuilt** copy of King's Gambit, a cinematic 3D chess
game built on Three.js and chess.js, with a negamax engine in a Web Worker. It
is embedded by the Arcade (`src/pages/ArcadeGamePage.tsx`, registry entry
`kings-gambit` in `src/config/arcade-games.ts`) and, in online mode, by
`src/pages/ArcadeChessOnlinePage.tsx`.

- Upstream: https://github.com/maldoteth/rork-medieval-3d-chess
  (our fork; branch `dehub-online`), forked from
  https://github.com/alexngdev99/rork-medieval-3d-chess
- Licence: MIT, Copyright (c) 2026 King's Gambit contributors. Full text in
  `LICENSE-KingsGambit` at the repo root.
- Vendored from the fork's `dehub-online` branch — the pinned commit is
  recorded in the PR that lands each re-vendor.

## The fork is the source of truth now

This directory used to carry four `.patch` files applied over the original
upstream at build time. When online multiplayer was added the game needed real
changes — a fifth game mode, a host bridge — that no longer fit the
patch-at-build-time model, so the fork became the maintained source and the
patches were committed into it. Anything that used to live in `patches/` is in
the fork's history under the same names.

What the fork adds on top of the original game:

- The four embed patches (inline worker, any-path route, trimmed frame head,
  host exit button), committed rather than applied.
- **Online mode**: a fifth `GameMode` where the opponent's moves arrive from
  the host page over `postMessage` and the local engine never runs. The
  protocol — `bridge-ready`, `start`, `move`, `opponent-move`, `clock`,
  `result`, `resign`, `desync`, `exit` — is documented in
  `web/src/core/hostBridge.ts` in the fork, and the host half lives in
  `src/pages/ArcadeChessOnlinePage.tsx` here. The bridge speaks to an iframe
  parent and to a React Native WebView alike, so the mobile app can host the
  same build unchanged.
- A `#online` frame URL flag that holds the game's own menu back while the
  host runs matchmaking.

The game still makes **no network requests of its own** beyond the asset
bucket below and Google Fonts. Matchmaking, identity and the match server are
the host page's business; the frame stays sandboxed without
`allow-same-origin` exactly as before, online or not.

## The 3D assets are NOT in this directory

The armies, weapons and score are ~44 MB of glTF and audio, and the game fetches
them at runtime from **`https://r2-pub.rork.com`**, the original upstream's
bucket. That is a third-party dependency in a user's session, and it is a
deliberate trade: 44 MB of binaries in git for every clone, forever, against a
bucket we do not control.

What makes it tolerable is that the failure is graceful, not fatal. Every roster
download is individually caught (`scene/pieces.ts`, `download()`), retried four
times with backoff (`scene/gltfQueue.ts`), and anything still missing falls back
first to the other army's sculpt and then to a procedurally built figure. With
the bucket entirely unreachable the game still boots, still plays, and still
looks like chess — it just loses the sculpted characters.

`connect-src` in `public/_headers` must therefore include `r2-pub.rork.com`.

**If that bucket ever dies**, the fix is to localise the assets rather than
patch around them:

```bash
# From the fork checkout, list every asset the game references:
grep -oE 'https://r2-pub\.rork\.com/[^"`]+' web/src/assets/generated.ts
# …plus the ${MODEL_BASE}/… and ${CRY_BASE}/… template literals in the same file.
```

Download them into `public/chess-game/media/`, then repoint `MODEL_BASE` and
`CRY_BASE` in `web/src/assets/generated.ts` at `./media` and commit that to the
fork.

## Rebuilding after a fork change

The fork builds itself: `.github/workflows/build-dist.yml` runs the typecheck,
the tests and `vite build --base=/chess-game/ --sourcemap false` on every push
to `main` or `dehub-online`, and uploads the result as the `chess-game-dist`
artifact. To re-vendor:

```bash
gh run list -R maldoteth/rork-medieval-3d-chess --limit 1
gh run download <run-id> -R maldoteth/rork-medieval-3d-chess -n chess-game-dist -D dist
```

Then replace `index.html` and `assets/` here with the artifact's (and
`favicon.png` if it changed). Do **not** copy `icon.png` (2.5 MB
apple-touch-icon), `banner.jpg` (upstream's share card), `robots.txt` or
`placeholder.svg` — an iframe uses none of them, and the first two alone are
2.9 MB.

The `--base=/chess-game/` flag in the workflow is required: without it the
built asset URLs are absolute to `/` and 404 when served from this subpath.

`src/test/arcade.test.ts` asserts the parts of the embed that a re-vendor can
silently break — the exit bridge strings in the bundle, the asset hashes the
entry document references, the `_headers` blocks. Run it after swapping files.

## Serving

Files here are copied verbatim into `dist/` by Vite and served from
`/chess-game/index.html` on the app's own origin. The player loads it in a
sandboxed iframe (`allow-scripts allow-pointer-lock`) with
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
The online page appends `#online` to whichever URL is in force.
