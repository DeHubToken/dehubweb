# Whisper transcription worker

Self-hosted speech to text for posts and stage recordings. It follows the shape
PeerTube uses (a separate transcription runner using faster-whisper), but none
of PeerTube's code: this worker uses faster-whisper (MIT) and sherpa-onnx
(Apache-2.0) directly.

- **Words:** faster-whisper, int8 on CPU and float16 on GPU, with
  `word_timestamps` and the Silero VAD filter.
- **Speakers:** sherpa-onnx diarization: pyannote segmentation 3.0 (MIT) plus
  the 3D-Speaker ERes2Net embedding model (Apache-2.0). It runs only when a job
  asks for it, and `transcribe` asks for stages, whose speaker map is matched
  against the room's AI/soundboard timeline. Video transcripts never show
  speakers, so posts skip it.
- **Output:** segments `{start, end, text, speaker?, words[]}`, the detected
  language and the duration. This is the shape `transcribe` already stores.
  Word timings are dropped before storage.

The image carries every weight. A cold start never downloads anything, and the
worker needs no network access beyond the media URL it is given. It holds no
database credentials.

## API

All routes except `/` need `Authorization: Bearer $WHISPER_WORKER_SECRET`.

| Route | What it does |
|---|---|
| `GET /` | Health: model, device, running and accepted job counts. |
| `POST /jobs` | `{input: {jobId, kind, ref, mediaUrl, diarize, callbackUrl, startBy}}`. Answers 202 at once. When the job finishes, the worker posts `{action: "complete", secret, jobId, kind, ref, ok, ...result}` to `callbackUrl`. Answers 503 when the queue (`WHISPER_QUEUE`, default 8) is full. |
| `POST /transcribe` | `{mediaUrl, diarize?}`. Synchronous; for checks by hand. |

A job whose `startBy` (unix seconds) has passed before it starts is reported as
failed rather than run, because the caller has already fallen back.

## How `transcribe` uses it

1. `transcribe` claims the row, stores the job id in `transcripts.engine_job_id`
   and dispatches the job.
2. If the worker is off, full, unreachable or refuses the job, the paid engines
   run straight away. Stages go to Scribe; everything else goes to Deepgram
   nova-3, then Scribe.
3. The callback writes the transcript only when the row is still waiting for
   that job id. A failure report hands the row to the paid engines immediately.
4. A job that starts and never answers is caught by the sweeper's 15-minute
   stale pass. That retry skips Whisper and uses the paid engines.

Configuration lives in the service-only `transcription_worker` row (id 1):
`enabled`, `worker_url` (an https origin) or `runpod_api_key` +
`runpod_endpoint_id`, and `secret`. The environment variables
`WHISPER_WORKER_URL`, `WHISPER_WORKER_SECRET`, `RUNPOD_API_KEY` and
`RUNPOD_WHISPER_ENDPOINT_ID` override it. Setting `enabled = false` is the
kill switch.

## Hosting

Never on live.dehub.io or the API droplet. Transcription uses every core it is
given, and lives must not break.

**Not hosted yet; `enabled` stays off and Deepgram does the work.** Switch it on
once monthly transcription passes about 10,000 minutes (Deepgram is $4.30 per
1,000): RunPod Serverless 16 GB GPU at $0.58/hour billed per second (about $1
per 1,000 minutes), or a DigitalOcean 4 vCPU / 8 GB droplet at $48/month flat.

- **RunPod Serverless (GPU):** image `ghcr.io/dehubtoken/dehub-whisper:gpu`,
  container start command `python handler.py`, 16 GB tier, 0 idle workers,
  at most 2 workers, execution timeout 900 s. `transcribe` posts to
  `/v2/<endpoint>/run` with the callback secret inside the job.
- **Any Docker host (CPU):** `ghcr.io/dehubtoken/dehub-whisper:cpu`, with port
  7860 behind TLS and `WHISPER_WORKER_SECRET` set. Give it its own machine.
  `WHISPER_THREADS` defaults to every core.

The images build in CI on every change to this folder and are pushed on main.

## Benchmark

`bench.py run` sends real posts through `engine.transcribe`, the same path a
job takes. `bench.py combine` scores each run against the transcript already
stored (from Deepgram or Scribe) and against large-v3-turbo as an independent
referee. It ran on GitHub-hosted runners for the pull request that added
this worker; the results are below.

### Results (2026-10-23, GitHub runner: 4 vCPU AMD EPYC 7763, int8)

Ten public posts in en (two), es, fr, it, ru, hi, tr, ar and ja, 22 minutes
in all; the ru post and one en post are songs. WER is word error rate
(character error rate for ja) against the stored transcript (Deepgram nova-3,
or Scribe where Deepgram heard nothing) and against large-v3-turbo as an
independent referee. Lower is better.

| Model | Median WER vs stored | Median WER vs turbo | Speed (× real time) | Language right |
|---|---|---|---|---|
| **medium** | **8.2%** | **6.0%** | 1.6× | 10/10 |
| small | 12.9% | 10.5% | 3.8× | 10/10 |
| small, VAD off | 18.0% | 15.5% | 3.6× | 10/10 |
| large-v3-turbo (referee) | 6.4% | — | 2.1× | 9/10 (ja heard as ko) |
| stored Deepgram/Scribe | — | 6.3% | — | — |

Per post, medium vs small against the stored transcript: en 2.0/2.0%,
fr 1.9/2.2%, it 3.6/6.0%, tr 5.4/9.9%, es 6.3/7.6%, ja 10.2/15.8% CER,
ar 25.9/35.8%, hi 33.2/54.4%. Hindi, Arabic and the two songs score badly for
every engine, Deepgram included; the gap between engines there is mostly
spelling and script, not lost words.

Two more posts were stored by Deepgram as Indonesian. Both are songs: one in
Italian, one in Hindustani. Deepgram's text for them is invented syllables.
Every Whisper model detected the right language and wrote the real lyrics.

**Medium is the model.** It agrees with the referee as closely as Deepgram
does, and it is clearly better than small on hi, ar and ja. At 1.6× real time
on four cores it still clears a day of today's volume (about 35 minutes of
media) in under 25 minutes, and on a GPU it is many times faster. Keep VAD on:
without it Whisper writes lines over music and silence.

The 26-minute stage took 12 minutes of medium on four cores, plus the speaker
pass below.

### Speakers

Stages are the only transcripts whose speakers anyone sees, so the speaker
pass was tuned on the 26-minute stage (one host; Scribe also heard one voice)
and two posts with several voices, scored against Deepgram or Scribe after
pairing labels one to one.

| Setting | Stage, 1 voice | Podcast, 2 voices | Drama clip, 3 voices | Stage time (4 cores) |
|---|---|---|---|---|
| ERes2Net, threshold 0.5 (first try) | 20 voices found | — | — | 310 s |
| CAM++, 0.9 | 5 voices, 50% | 3 voices, 82% | 6 voices, 46% | 163 s |
| WeSpeaker ResNet34, 0.85 | 2 voices, 100% | 1 voice, 65% | 2 voices, 71% | 318 s |
| **ERes2Net, 0.95 + clean-up** | **1 voice, 100%** | **2 voices, 100%** | 6 voices, 61% | 128–206 s |

The clean-up folds a voice heard for under 8 seconds and under 3% of the
recording into whoever is speaking around it; one real guest with 20 seconds
in an hour keeps their label. Fast back-and-forth in a two-minute drama clip
is still split too finely, which is acceptable: posts never show speakers.
