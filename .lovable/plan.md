# Video Transcripts on Post Info Page

Add a transcript section to the post info page (`/app/post/:id/info`) for video posts. Transcripts are generated on-demand via Gemini 2.5 Flash-Lite, cached server-side per `tokenId`, and automatically chunked for videos longer than 10 minutes.

## UX

On `PostInfoPage`, for any post whose `nftInfo` resolves to a video (has `videoUrl`/video duration):

- New collapsible "Transcript" section (liquid-glass card, white text), placed below the existing creator/info blocks.
- Collapsed by default; expanding triggers a fetch of any cached transcript.
- States:
  - **Not generated yet** → "Generate transcript" button (always button-driven, no auto-run, regardless of length). Shows an estimated cost hint for >10-min videos.
  - **In progress** → spinner + progress label ("Transcribing chunk 2/4…") with live updates via polling.
  - **Ready** → scrollable segment list. Each segment shows `[mm:ss] text`; clicking a timestamp copies it (player isn't embedded on the info page).
  - **Failed** → error + "Retry" button.
- "Copy transcript" and "Download .txt" actions when ready.

## Backend

### New table `public.video_transcripts`
- `token_id int PK`
- `status text` — `pending` | `processing` | `ready` | `failed`
- `transcript jsonb` — `{ segments: [{ start, end, text }], full_text }`
- `duration_seconds int`
- `chunks_total int`, `chunks_done int`
- `error text`
- `model text` (default `google/gemini-2.5-flash-lite`)
- `created_at`, `updated_at`
- RLS: public SELECT (transcripts are public, like the post). Writes only via service role.
- GRANTs: `SELECT` to `anon` + `authenticated`, `ALL` to `service_role`.

### New edge function `transcribe-video` (`verify_jwt = false`)
Inputs: `{ tokenId: number, action: 'start' | 'status' }`.

- `status` → returns current row from `video_transcripts`.
- `start` →
  1. Resolve `videoUrl` via existing `buildVideoUrl(tokenId)` and fetch `videoDuration` from DeHub NFT info.
  2. Upsert row as `processing`, `chunks_total = ceil(duration / 480s)` (8-min chunks, safe under Flash-Lite limits).
  3. Kick off background work via `EdgeRuntime.waitUntil(...)`; return immediately with the row.
  4. Background loop: for each chunk, call Lovable AI Gateway (`/v1/chat/completions`, model `google/gemini-2.5-flash-lite`) with the video URL as a `video_url` content part and a prompt that asks for JSON segments **restricted to the time window `[start, end]`** for that chunk. Parse JSON, merge into accumulator, increment `chunks_done`, persist.
  5. On 429 / context-limit / parse failure: halve the chunk window (recursive split, min 60 s) and retry that segment up to 3 times before marking `failed`.
  6. When all chunks done: write `status='ready'` with merged sorted segments + `full_text`.

No new secrets — uses the existing `LOVABLE_API_KEY`.

### Frontend wiring
- New hook `useVideoTranscript(tokenId)` in `src/hooks/use-video-transcript.ts`:
  - `useQuery` against the edge function's `status` action, `staleTime: Infinity` when `ready`, `refetchInterval: 3s` when `processing`.
  - `useMutation` that calls `start` and invalidates the query.
- New component `src/components/app/post-info/TranscriptSection.tsx` rendering the collapsible card and states.
- Wire into `src/pages/app/PostInfoPage.tsx`, only mounted when `nftInfo.videoUrl` (or detected video content) is present.

## Cost / safety notes (not part of the build)
- Always button-driven → zero passive credit burn.
- 8-min chunks at ~124k input tokens each fit comfortably inside Flash-Lite's window; cached after first run so subsequent visitors pay nothing.
- Recursive halving handles edge cases where a chunk still trips a limit.

## Out of scope
- Click-to-seek inside an embedded player on the info page (player isn't shown there).
- Translations of the transcript.
- Re-using transcripts to cheapen `general-ai-chat` follow-up questions — can be a follow-up task.
