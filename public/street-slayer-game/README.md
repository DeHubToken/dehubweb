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

`c2runtime.js` and `data.js` carry **no code changes**. Everything below is
either an edit to `index.html`, which a re-export overwrites, or a
recompression that leaves every filename and every pixel dimension exactly as
the exporter wrote them — so `data.js`, which addresses each sprite by sheet
name and source rectangle, never has to know.

One caveat on "as delivered": git normalises line endings, so the text files
here are stored LF where the delivered archive had CRLF. The content is
identical; a byte-for-byte diff against the archive is not, and cannot be.

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
3. **A boot screen.** Construct 2's stock loader is a percentage in plain text
   over `loading-logo.png`, which is the **Construct 2 engine cog**, not this
   game — the first thing a player saw was somebody else's branding. It is
   covered by an overlay carrying the game's own wordmark
   (`dehub-loader-wordmark.png`, cut from `images/game_title-sheet0.png`) and a
   bar driven by the runtime's real `loadingprogress`. The stock loader still
   draws underneath and is simply never visible, so `loading-logo.png` stays.
4. **A portrait guard.** The project is a fixed 854x480 landscape with its touch
   pad and action buttons placed for that shape, and "Orientations: Any" in the
   project settings means nothing upstream stops it being opened in portrait —
   where letterbox scaling shrinks the whole game to an unplayable strip. The
   overlay is advisory and dismissable: someone with orientation lock on cannot
   rotate, and refusing them the game entirely would be worse than a small one.

5. **A run bridge.** The game feeds the arcade leaderboard by posting
   `run-start`, `run-progress` and `run-end` to the parent, carrying how far
   down the street the camera got and how much health was left. It reads the
   runtime — `running_layout.scrollX`, `original_width`, and `life_of_p1` out of
   `all_global_vars` — and nothing else; the host relays to the server, and the
   server decides what the run was worth
   (`supabase/functions/arcade-score/index.ts`). `src/test/arcade.test.ts`
   asserts every name it depends on still exists.

   **It does not rank stages, and that is not an oversight.** The project has a
   global called `number_of_complete_stages` that looks exactly like the metric
   to use. It is compared in six places and set in two, both times to zero, and
   incremented nowhere — so it is always 0, and a leaderboard built on it would
   never have gained a single row. That is a property of this delivered build,
   established by walking every event in `data.js` rather than by reading the
   variable's name. If a future export fixes it, the bridge is where to change.

   The reachable street is the layout width less one screen (4600 − 854), not
   the layout width: Construct clamps the camera half a screen in at each end,
   so `scrollX` only ever travels 427..4173, and dividing by 4600 would mean
   nobody could ever finish.

Three of the last four read `cr_getC2Runtime()`, a global the export already
publishes. That is an engine handle rather than an API, so the test asserts it
still exists after a re-vendor — and the boot screen retires itself on a 60s
deadline regardless, so losing the handle can never leave a permanent black
overlay on a game that is already playable.

## Recompression

The delivered build was 8.97 MB. It is now 6.53 MB, with no change to any
filename or dimension:

- **Every PNG through `oxipng -o max --strip safe`** — fully lossless, 10.7%.
- **Six sheets additionally quantised to a 256-colour palette**:
  `game_title-sheet0..3` and `game_over-sheet0..1`, 3773 KB to 2480 KB. These
  six were chosen because they were the only large RGBA sheets *and* because
  they measured **0.000% partial-alpha pixels**, which makes the binary-alpha
  step of the quantise free. Do not extend this to `scenery_00-*`: it has
  partial alpha, and it is gameplay art on screen the whole time rather than a
  logo shown for seconds.
- **All 58 sounds re-encoded to mono Vorbis** (q2, and q3 for the music), 1280 KB
  to 677 KB. Mono is safe here on two counts: the game contains no panning
  action of any kind, and the side (L−R) signal measured 16–23 dB below the
  programme on every file tested — one of them at −inf, i.e. bit-identical
  channels. The soundbank was effectively dual mono already.

The single biggest remaining win is not compressible from here: `game_title` is
**four 2048x2048 sheets holding ~28 frames of animated wordmark**, each sheet
roughly 44% empty, and that is 2.4 MB of the 4.5 MB of art. Fixing it means
repacking in Construct 2 and re-exporting, because `data.js` hard-codes the
source rectangles.

## Controls

Arrows or WASD to move, Z to jump, X / C / V / B to attack, Esc or P to pause,
R to restart the stage. On a touchscreen the game draws its own directional pad
and action buttons, so it needs nothing from `public/arcade-touch/`.
