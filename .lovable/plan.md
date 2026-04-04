

## Add Seedance 1.5 Pro as a Video Generation Option

Seedance 1.5 Pro by ByteDance is available on Replicate at `bytedance/seedance-1.5-pro`. It supports text-to-video and image-to-video with native audio generation, 720p/1080p, up to 12 seconds, and multiple aspect ratios. It's a strong competitor to Kling 2.6 Pro.

### Changes

**1. `src/constants/video-models.constants.ts`** — Add Seedance entry:
- ID: `seedance-1.5-pro`
- Supports: text-to-video, image-to-video
- Duration: 2-12s
- Tier: premium
- hasAudio: true
- baseCostUsd: ~$0.80 (estimated from Replicate's per-second pricing, ~5s default)

**2. `supabase/functions/generate-video/index.ts`** — Add backend support:
- Add `seedance-1.5-pro` to the `VIDEO_MODELS` map with Replicate model ID `bytedance/seedance-1.5-pro`
- Add a `case 'seedance-1.5-pro'` in the input builder switch with parameters: `prompt`, `duration` (integer seconds), `aspect_ratio`, `generate_audio: true`, and optional `image` for I2V mode
- No version hash needed — uses the standard model path

### Seedance Input Parameters
- `prompt` (string) — text prompt
- `duration` (integer, 2-12, default 5) — video length in seconds
- `aspect_ratio` (string, default "16:9")
- `resolution` (string, default "720p")
- `generate_audio` (boolean, default true)
- `image` (uri, optional) — for image-to-video
- `seed` (integer, optional)

### Pricing Note
Replicate prices Seedance per second of output. Estimated ~$0.10-0.16/sec. For a 5s default video, base cost is roughly $0.50-0.80. Will set baseCostUsd to $0.65 (middle estimate) — can be adjusted after observing actual costs.

