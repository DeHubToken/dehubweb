# Editor launch film

30.5-second launch film for the DeHub video editor, rendered as 1920×1080 and 1080×1920 at 60 fps with a -14 LUFS soundtrack.

Story, on a 140 BPM grid (beats in brackets):

| Beat | Scene |
| --- | --- |
| 0–8 | A prompt is typed into the AI box: "cut this video up into 1 second chunks and add brainrot". |
| 8–20 | The editor flies out in 3D. The playhead cuts the clip into twelve 1-second clips, then captions, sound effects and an FX track drop in and the canvas becomes 9:16. |
| 20–28 | The finished brainrot edit: a hard cut every half beat (punch-in, crash zoom, pull-out, whip, mirror, slow-mo echo), white and neon flashes, hue-swap grades, deep-fried freeze frames on the emoji hits and word-by-word captions. |
| 28–40 | "You ask. It edits." then sixteen real editor features at half-beat speed. |
| 40–52 | Post: render dialog, composer, then a circle wipe into the feed with likes and reactions. |
| 52–60 | "FREE — for every user, until further notice." |
| 60–68 | The same icon ending the editor puts on downloads, with `dehub.io/editor`. |

## Files

- `film.html`, `film.js`: the whole picture. `render(t)` sets every element from the time alone, so any frame can be rendered in any order. `?w=1080&h=1920` switches to the vertical layout.
- `synth.mjs`: the soundtrack (F minor phonk: cowbell riff, sliding 808, claps, hats) plus every UI sound, timed from the events the page exports. No samples; the end chime is the editor's own download-ending sound.
- `capture.cjs`: Chromium frame capture, with extra subframes inside the motion-blur windows defined in `film.js`.
- `post.py`: blends motion-blur subframes, adds glitch tears, RGB split, grain and vignette, then encodes H.264 + AAC.
- `prep-footage.sh`: swaps in other footage for the clip being cut up (`prep-footage.sh a.mp4 b.mp4`); without it the Osaka loop is used.
- `render.sh`: runs the whole pipeline for one size. `scan.py` lists the largest frame-to-frame changes to catch stray flashes.

## Render

```bash
npm ci                                  # repo root, for lucide icons
npm i --no-save playwright-core@1.56.1  # or set PLAYWRIGHT_CORE to an existing install
docs/launch-films/editor/prep-assets.sh
docs/launch-films/editor/render.sh 1920 1080 16x9
docs/launch-films/editor/render.sh 1080 1920 9x16
```

Set `CHROMIUM_PATH` if Chromium is not at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Each size takes about 10 minutes on four cores. Output: `dehub-editor-launch__16x9.mp4` and `dehub-editor-launch__9x16.mp4`.

Animated emoji are from [Noto Emoji Animation](https://googlefonts.github.io/noto-emoji-animation/) (CC BY 4.0), the same set the app uses for reactions.
