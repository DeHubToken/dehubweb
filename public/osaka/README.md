# Osaka theme media

The Osaka theme needs two files that are **not in this repo**. Everything else
about the theme is committed; only the media is fetched.

| File | What it is | Spec | Size |
| --- | --- | --- | --- |
| `osaka-loop.mp4` | The alley backplate. Sampled as a `THREE.VideoTexture` and refracted through the rain shader. | H.264 high, 1920x1070, 24 fps, ~15 s, **no audio track**, `+faststart` | ~4.4 MB |
| `osaka-ambience.mp3` | The looping soundtrack. Streamed progressively, so only the seconds actually played get fetched. | MP3, 44.1 kHz stereo, 128 kbps | ~18 MB |

## Why they are not committed

Together they are ~23 MB, and the mp3 alone would be the largest blob in this
repository by roughly 2x, permanently, for a theme most clones never switch on.
Git keeps every version of a binary forever, so re-encoding the track once would
double that cost again.

## Getting them in place

Either **drop the two files into this folder** (they are gitignored, so they
will not show up in `git status`), or **point the theme at a CDN**:

```
VITE_OSAKA_MEDIA_BASE=https://cdn.example.com/osaka
```

The base has no trailing slash and the two filenames above are appended to it.
Unset, it defaults to `/osaka`, which is this folder.

## Without them

The theme still works and is still deliberately designed. `OsakaBackground`
listens for the video's `error` event; on a miss it removes its own WebGL canvas
and sets `data-osaka-media="absent"` on `<html>`, which swaps in a standalone
neon-wash backdrop (see the no-media fallback block in
`src/styles/osaka-frame.css`). The CSS rain film, the wet-glass chrome and all
the neon tokens are unaffected. The soundtrack control unmounts entirely rather
than sitting there offering to play a file that will never load.

So a fresh clone gets a coherent rainy-neon theme with no video and no music,
and adding the files upgrades it. Nothing 404s in the console twice, and nothing
renders as a black rectangle.

## Re-encoding from a master

The masters this was built from were 3856x2148 at 15.5 Mbps (with a useless
audio track, since the backplate is muted) and a 192 kbps mp3:

```bash
ffmpeg -i master.mp4 -an -vf "scale=1920:-2" -c:v libx264 -preset slow -crf 23 \
  -pix_fmt yuv420p -profile:v high -movflags +faststart osaka-loop.mp4

ffmpeg -i master.mp3 -c:a libmp3lame -b:a 128k -ar 44100 -ac 2 -write_xing 1 \
  osaka-ambience.mp3
```

Do not ship the 4K master. Pass A of the shader immediately throws away 8/9 of
it, so the only thing the extra resolution buys is a 4x larger per-frame GPU
texture upload.
