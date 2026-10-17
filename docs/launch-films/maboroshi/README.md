# Maboroshi launch film

30.5-second launch film for Maboroshi in DeHub Creator, rendered as 1920×1080 and 1080×1920 at 60 fps with a -14 LUFS soundtrack. Same engine, length and format as the editor launch film (`../editor`).

All footage is real: motion-library clips and their Maboroshi recasts from `public/creator-clips`, plus the Jean Phil templates. Every swap shows the original clip turning into the recast behind a wipe line, labelled ORIGINAL and MABOROSHI.

Story, on a 140 BPM grid (beats in brackets):

| Beat | Scene |
| --- | --- |
| 0–4 | Jean Phil templates, a cut on every half beat. "JEAN PHIL'S MOVES." "YOUR FACE." |
| 4–6 | Cat Performer: the dancer turns into a cat. "ANYONE. ANYTHING." |
| 6–8 | 幻 / MABOROSHI title over the library wall. |
| 8–20 | Eight original vs Maboroshi pairs, one every bar and a half (side by side, or full frame with the original in a corner). "ANY CLIP." "ANY PERSON." "SAME MOVES." |
| 20–28 | The drop: a full-frame swap on every half beat, quarter-beat cuts, then twelve recasts at once. |
| 28–32 | "YOUR SCENE. NEW YOU." over the wall. |
| 32–40 | Pull back from one clip to the library, a counter to 19,537 clips, then Pick a clip · Add your character · Swap. |
| 40–48 | Jean Phil templates four at a time. "JEAN PHIL TEMPLATES." "NOW STARRING YOU." |
| 48–52 | Your soundtrack stays yours · Review it before you pay · Web + app, same project. |
| 52–60 | 幻 MABOROSHI, "Your scene. A different you." |
| 60–68 | The editor's download ending with `dehub.io/creator/maboroshi`. |

## Files

- `film.html`, `film.js`: the whole picture. `render(t)` sets every element from the time alone and waits for the clip frames it needs. `?w=1080&h=1920` switches to the vertical layout. Casting (which clips go where) is the block under `// casting`.
- `prep-clips.py`: downloads the clips listed in `public/creator-clips` and cuts 4.2 s of each into `a/clips` at 30 fps.
- `synth.mjs`: the soundtrack (the editor film's F minor phonk kit) plus a sound for every cut and swap, timed from the events the page exports.
- `capture.cjs`, `post.py`, `scan.py`, `sheet.py`: frame capture with motion-blur subframes, the grain/glitch post pass and encode, a stray-flash check and contact sheets (shared with the editor film).

## Render

```bash
npm i --no-save playwright-core@1.56.1           # or set PLAYWRIGHT_CORE to an existing install
docs/launch-films/maboroshi/prep-assets.sh       # set LUCIDE to a lucide-react icons folder if node_modules is missing
docs/launch-films/maboroshi/render.sh 1920 1080 16x9
docs/launch-films/maboroshi/render.sh 1080 1920 9x16
```

Output: `dehub-maboroshi-launch__16x9.mp4` and `dehub-maboroshi-launch__9x16.mp4`.
