---
title: DeHub video dubs
sdk: docker
app_port: 7860
---

# Video dubbing

Chatterbox Multilingual v3 reads translated transcript segments using a sample
of each identified speaker. The cached AAC contains speech only. Web and mobile
play it alongside the video, with independent voice and original-volume controls.
Original volume stays constant between lines. If no suitable sample exists,
the worker uses its stock voice. No database credentials reach the worker.

## Existing server deployment

The existing backend host can run the worker in `/srv/dehub-dub/app` with an
isolated `/srv/dehub-dub/venv`. Install CPU torch/torchaudio before the pinned
requirements, using the same versions/index as the Dockerfile. The checked-in
systemd unit runs as a dedicated user, on loopback only, capped at one CPU and
6 GB RAM with lower scheduling priority. Install `nginx-location.conf` as an
include in the existing TLS server block, validate nginx, then reload it.

The service reads the existing shared worker secret from `/etc/dehub-dub.env`
(root-owned, mode 0600). Set the service-only `video_dub_worker.worker_url` to
`https://live.dehub.io/internal/video-dubs/jobs`; the Edge Function reads
that row when environment overrides are absent. Apply the HTTP configuration
migration before deploying the function. Keep the sweep cron disabled.

## Hosting

The Dockerfile targets CPU and serves one job at a time on port 7860. It can run
on existing compute or a Hugging Face Docker Space if the account's plan allows it.
Copy this directory to the Space root. Set its `DUB_WORKER_SECRET` secret and
set these backend secrets:

```
DUB_WORKER_URL=https://<host>/jobs
DUB_WORKER_SECRET=<same random secret>
```

Do not publish secrets in the repository. Requests require the shared secret;
downloads and reference audio stay in a temporary directory removed after each
job. Only public videos enter the shared public audio cache. Callback results
must match both the dub and the current job ID, with a separate upload path per
attempt. Concurrent viewer requests claim a row before dispatching work.

Chatterbox has no per-character licence fee. Hosting has separate requirements;
the current Hugging Face signup requires a paid plan for Docker Spaces. Reuse
existing compute where possible. First renders can be slow and idle hosts may sleep. No
latency or throughput has been established for this deployment. The first job
downloads the weights; subsequent jobs reuse them. Device speech remains the
fallback while a render is pending or the host is unavailable. Finished audio
is shared by subsequent viewers on both platforms.

The existing RunPod adapter is also supported with a suitable CUDA image and
`python handler.py` as its command. It requires `RUNPOD_API_KEY` and
`RUNPOD_DUB_ENDPOINT_ID`; this is an optional paid host, not the default Docker
deployment. Do not enable the disabled sweep cron for this rollout.

## Stage speech

Stage voice pickers request Google Chirp 3 HD through the existing speech
endpoints. Set backend secret `GOOGLE_TTS_SERVICE_ACCOUNT_JSON` to the JSON key
of a dedicated Google Cloud service account allowed to use Text-to-Speech.
The backend exchanges signed assertions for short-lived OAuth tokens and caches
them until shortly before expiry. Credentials remain in backend secrets. Deploy `elevenlabs-voices`
and `elevenlabs-tts` after applying `20261008140000_chirp_speech_budget.sql`.
Existing custom voices retain their ownership checks and original provider.

The shared database reserves characters atomically before each Chirp call and
stops at 1,000,000 per billing month. Failed or uncertain calls remain counted;
there is no automatic paid fallback after that cap. This counter covers this
application, not unrelated use of the same Google Cloud project. Before the
Google secret is configured, the picker retains the existing voice catalogue
and logs the fallback reason. Google API errors are surfaced to the caller.

## Verification

Cloud CI tests speech-only output, per-speaker references and callback attempt
identity without downloading weights. Deployment still requires a real public
video render and an authenticated stage speech request on production. Confirm
the cached voice follows pause, seek, mute and playback speed on web/mobile,
and that each volume slider affects only its own track.
