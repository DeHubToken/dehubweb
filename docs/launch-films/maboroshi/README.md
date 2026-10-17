# Maboroshi launch film

30.5-second launch film for Maboroshi in DeHub Creator, rendered as 1920×1080 and 1080×1920 at 60 fps with a -14 LUFS soundtrack. Same engine, length and format as the editor launch film (`../editor`).

Story, on a 140 BPM grid (beats in brackets):

| Beat | Scene |
| --- | --- |
| 0–6 | A dark figure stands in the neon alley, tracked as the subject. "KEEP THE SCENE." On beat 4 it turns into Liquid chrome. "CHANGE WHO IS IN IT." |
| 6–8 | 幻 / MABOROSHI title card. |
| 8–20 | The real studio flow: upload the clip, search "plushie", pick Plushie takeover, add a reference, Prepare (depth + subject mask), approve, Generate preview. |
| 20–28 | The drop: one look per beat rising through a scan line (Plushie takeover, Anime hero, Liquid chrome, Crochet companion, Crystal guardian, Clay character), hard cuts, then all six at once. |
| 28–40 | "SAME MOVES. NEW YOU." then sixteen real presets from the 180-look catalog, with a counter racing to 180. |
| 40–52 | Your soundtrack stays yours · Review it before you pay · Web and app, same project. |
| 52–60 | 幻 MABOROSHI, "Your scene. A different you." |
| 60–68 | The editor's download ending with `dehub.io/creator/maboroshi`. |

## Files

- `film.html`, `film.js`: the whole picture. `render(t)` sets every element from the time alone. `?w=1080&h=1920` switches to the vertical layout. The studio is a replica of `services/maboroshi/static`.
- `synth.mjs`: the soundtrack (the editor film's F minor phonk kit) plus every UI and swap sound, timed from the events the page exports.
- `capture.cjs`, `post.py`, `scan.py`: frame capture with motion-blur subframes, the grain/glitch post pass and encode, and a stray-flash check (shared with the editor film).
- `cut-looks.py`: splits `looks-atlas.png` into the six featured looks and cuts each character out.

## Render

```bash
pip install rembg onnxruntime                    # once, for cut-looks.py
npm i --no-save playwright-core@1.56.1           # or set PLAYWRIGHT_CORE to an existing install
docs/launch-films/maboroshi/prep-assets.sh       # set LUCIDE to a lucide-react icons folder if node_modules is missing
docs/launch-films/maboroshi/render.sh 1920 1080 16x9
docs/launch-films/maboroshi/render.sh 1080 1920 9x16
```

Output: `dehub-maboroshi-launch__16x9.mp4` and `dehub-maboroshi-launch__9x16.mp4`.

The alley is `public/osaka/osaka-loop.mp4`. The six characters come from `services/maboroshi/static/looks-atlas.png`; they are look inspiration art, shown as stills in the scene, not rendered Maboroshi output.
