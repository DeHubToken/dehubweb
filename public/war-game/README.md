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

## Rebuilding after an upstream change

```bash
git clone https://github.com/mshumer/Claude-of-Duty.git
cd Claude-of-Duty
npm install
npx vite build --base=/war-game/ --sourcemap false
```

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
