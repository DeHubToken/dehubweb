# Requests ad

15-second ad for the Requests page (`/features`), rendered as 1080×1920 and 1920×1080 at 60 fps with a -14 LUFS soundtrack. Built on the editor launch film's engine (same chrome type, phonk kit, glitch post pass and logo ending).

| Beat | Scene |
| --- | --- |
| 0–4 | "What should we build next?" A prompt is typed into the composer and posted. |
| 4–16 | The Requests page in 3D: the new request drops in, votes climb, status goes Under Review → Planned → In Progress, the tab slides to Shipped, then "Your feedback shipped!". |
| 16–20 | "YOU PROMPT IT. WE SHIP IT." |
| 20–24 | Prompt · Vote · Build · Ship. |
| 24–30 | "The world's first truly community-built platform?" |
| 30–35 | Logo ending with `dehub.io/features`. |

## Render

```bash
npm i --no-save playwright-core@1.56.1   # or set PLAYWRIGHT_CORE to an existing install
docs/launch-films/requests/prep-assets.sh
docs/launch-films/requests/render.sh 1080 1920 9x16
docs/launch-films/requests/render.sh 1920 1080 16x9
```

Set `CHROMIUM_PATH` if Chromium is not at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Animated emoji are from Noto Emoji Animation (CC BY 4.0).
