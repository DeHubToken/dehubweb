# Street Slayer — vendored build

A side-scrolling beat 'em up, and the only game in the arcade that is not a
third-party open-source project: it was **commissioned for DeHub** and delivered
as a finished build. The three playable fighters are Mike, Indi and Lerone.

| | |
| --- | --- |
| Upstream | none — there is no public repository |
| Author | Studio Shook Pixel |
| Delivered | 13 Aug 2026, as `STREET SLAYER HTML 5.zip` |
| Project version | 2.3 (`STREET SLAYER CAP V2_3.capx`) |
| Engine | Construct 2, runtime r244 (`saved-with-version` 24400) |
| Licence | proprietary — see `LICENSE-StreetSlayer` at the repo root |

Because there is no repository, the pinned commit every other vendored game
records is a **delivered archive** instead. Re-vendoring means re-exporting from
the `.capx` in Construct 2, or asking for a fresh HTML5 export, and then redoing
the two page edits below by hand.

The desktop wrappers (win32, win64, osx64, linux64) and the `.capx` project
shipped alongside this build are not in the repo — they are ~430 MB and none of
them is servable.

## What the engine does, and what that costs here

Read this before touching `_headers`. Construct 2 requests **every one of its own
assets in CORS mode**:

- `data.js`, the project model, over `XMLHttpRequest` (`c2runtime.js:3657`)
- every spritesheet with `img.crossOrigin = "anonymous"`, which upstream's own
  comment marks as *"required for Arcade sandbox compatibility"* — Scirra's
  arcade frames games exactly the way this app does (`c2runtime.js:4265`, `:4621`)
- every `.ogg` over `XMLHttpRequest`, for `decodeAudioData` (`c2runtime.js:16008`)

The frame has no `allow-same-origin`, so its origin is `null` and all of that
goes out cross-origin. **`/street-slayer-game/*` therefore needs
`Access-Control-Allow-Origin: *` across the whole directory**, not just an
`assets/` subtree like the Vite-built games — there is no such subtree here, and
a missing header is silent: a black frame, no console error.

Other properties worth knowing, read from the `.capx`:

- **Fullscreen in browser: Letterbox scale.** The 854×480 design resolution
  scales to fill the frame and letterboxes the remainder. Nothing here has to
  size the canvas.
- **Loader style: Percentage text.** The game paints its own loading screen with
  a real percentage, which is why the registry sets `hasOwnBootScreen` and the
  host draws no readout of its own.
- **Enable WebGL: On**, but the runtime falls back to canvas2d on its own. This
  is 2D sprite work at 854×480, so it plays on a software rasteriser — the
  registry's preflight is deliberately much softer than the 3D games'.
- **No save/load.** The project never calls Save or Load to slot, so the
  runtime's `localStorage` paths are never reached. That matters: reading
  `localStorage` on an opaque origin throws, and two of those reads are outside
  the runtime's own try/catch (`c2runtime.js:7074`, `:7085`).
- Plugins: Audio, Keyboard, Sprite, Sprite font, Touch. **No Mouse plugin and no
  pointer lock**, so the frame needs neither in its `allow`.

## Local changes

Two, both in `index.html`, both **page** edits that a re-export will not
reproduce. `c2runtime.js`, `data.js` and every asset are untouched.

1. **The service worker registration is a no-op, and the offline set is not
   vendored.** `sw.js`, `offline.js`, `offlineClient.js` and `offline.appcache`
   are all dropped, and `<html manifest="offline.appcache">` with them (AppCache
   has been removed from browsers regardless). A service worker cannot be
   registered from an opaque origin at all — and upstream's guard,
   `if (!navigator.serviceWorker) return;`, sits *outside* its own try/catch,
   while reading that property on an opaque origin **throws**. The runtime calls
   `window.C2_RegisterSW()` by name during startup, so the function stays
   defined and empty rather than deleted.
2. **An exit chip.** The arcade player hands over the whole viewport and draws no
   close of its own, so each game provides one and posts
   `{ source: 'street-slayer', type: 'exit' }` to the parent. It is a button
   rather than a key binding because every key that reads as "quit" is already
   taken by the game: Esc and P toggle its pause, R restarts the stage. It sits
   top-centre because that is the one empty strip in the layout — portrait and
   life bar top-left, directional pad bottom-left, action buttons bottom-right,
   touch pause button top-right. `src/test/arcade.test.ts` asserts all three
   halves of that bridge.

## Controls

Arrows or WASD to move, Z to jump, X / C / V / B to attack, Esc or P to pause,
R to restart the stage. On a touchscreen the game draws its own directional pad
and action buttons, so it needs nothing from `public/arcade-touch/`.
