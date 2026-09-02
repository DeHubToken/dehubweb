# auto-dub worker

Voice-cloned dubbing for video posts. `supabase/functions/auto-dub` decides
what to dub and calls this; this turns one job into one AAC track.

Stack: XTTS-v2 (Coqui, open weights) for voice-cloned speech, ffmpeg for the
audio plumbing. No paid API in the loop — the cost is GPU seconds.

## Deploy (RunPod serverless)

1. RunPod → Serverless → New Endpoint → **GitHub repo**, this repository,
   Dockerfile path `services/auto-dub/Dockerfile`.
2. GPU: any 16 GB+ card (RTX 4090 / A5000 / L4). Workers: min 0, max 3.
   Idle timeout 30 s. Container disk 20 GB (the model is baked into the image).
3. Copy the endpoint id into the Supabase secrets:

```
RUNPOD_API_KEY=…            RunPod → Settings → API keys
RUNPOD_DUB_ENDPOINT_ID=…    the endpoint id
DUB_WORKER_SECRET=…         any long random string; the worker echoes it back
DUB_AUTO_LANGS=en,es,pt,fr,de,ar,hi,zh   (optional) languages the sweeper fills
DUB_MAX_SECONDS=180                       (optional) sweeper length ceiling
```

The job payload is self-contained (video URL, lines, a signed upload URL and a
callback), so the worker needs **no** environment variables of its own.

## Run one locally

```
python handler.py job.json
```

`job.json` is the `input` object the function sends — grab one from the
function logs. Works on CPU, slowly.

## Cost

A 60-second short into one language is ~15–30 GPU-seconds end to end on a
4090-class card, i.e. well under a cent. Cold start (model already in the
image) is ~20 s.
