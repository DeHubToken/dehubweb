# Osaka theme media

One file, and it ships in the repo.

| File | What it is | Spec | Size |
| --- | --- | --- | --- |
| `osaka-loop.mp4` | The alley backplate. Sampled as a `THREE.VideoTexture` and refracted through the rain shader. | H.264 high, 1920x1070, 24 fps, ~15 s, **no audio track**, `+faststart` | ~4.4 MB |

There is no soundtrack. The theme deliberately makes no sound: a social feed
that starts playing music at you is a bad guest.

## Why it is committed

4.4 MB is in line with what this repo already carries (`public/santa-mix.mp3`
is 3.2 MB, `public/sounds/ooh-ahh.wav` is 9.7 MB), and committing it is what
makes the theme work on a fresh clone and on a deploy with no extra setup.

An earlier revision gitignored it to keep the repo light. That looked correct
in isolation and was wrong in practice: the deployed site answered the video
request with the SPA's `index.html` catch-all, so the video element downloaded
HTML, failed to decode it, and the theme silently fell back to its CSS-only
backdrop. A background video that only works on the machine that authored it
is not a feature.

## Serving it from a CDN instead

Optional. Upload the file somewhere and set:

```
VITE_OSAKA_MEDIA_BASE=https://cdn.example.com/osaka
```

No trailing slash; `osaka-loop.mp4` is appended. Unset, it defaults to
`/osaka`, which is this folder.

## If it fails to load

The theme still works. `OsakaBackground` listens for the video's `error` event
and retries once after 1.2s with a cache-busting query, because a browser
negatively-caches a 404 and re-requesting the same URL would replay it from
cache. Only if the retry also fails does it commit: it removes its own WebGL
canvas and sets `data-osaka-media="absent"` on `<html>`, which swaps in a
standalone neon-wash backdrop (see the no-media fallback block in
`src/styles/osaka-frame.css`). The wet-glass chrome and every neon token are
unaffected.

## Re-encoding from a master

The master this was built from was 3856x2148 at 15.5 Mbps, with an audio track
that the muted backplate never used:

```bash
ffmpeg -i master.mp4 -an -vf "scale=1920:-2" -c:v libx264 -preset slow -crf 23 \
  -pix_fmt yuv420p -profile:v high -movflags +faststart osaka-loop.mp4
```

Do not ship the 4K master. Pass A of the shader immediately throws away 8/9 of
it, so the only thing the extra resolution buys is a 4x larger per-frame GPU
texture upload.
