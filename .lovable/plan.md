## Goal
Remove the host-only restriction on transcripts and make them auto-generate once a Stage ends, so every participant (and any viewer) just sees the transcript when they open the drawer.

## Changes

### 1. `transcribe-stage` edge function
- Drop the `host_wallet_address === wallet` check (and the wallet requirement).
- Allow any authenticated caller to trigger transcription as long as the stage is `ended` and has a `recording_url`.
- Keep the idempotency guard: if a `stage_transcripts` row exists with status `processing` or `ready`, return it as-is. Only re-run on `failed` or missing.
- Keep `EdgeRuntime.waitUntil` background processing + ElevenLabs Scribe v2 with diarization.

### 2. Auto-trigger on stage end
Two layers so it "just works":

- **Server-side (primary):** add a small `auto-transcribe-ended-stages` edge function scheduled via `pg_cron` every 2 minutes. It selects `audio_spaces` where `status='ended'`, `recording_url` is not null, and there is no `stage_transcripts` row yet (or status='failed'), then calls `transcribe-stage` for each. This guarantees a transcript exists even if no one opens the drawer.
- **Client-side (fallback):** when any user opens `StageTranscriptDrawer` for an ended stage with a recording and no transcript row, fire `transcribe-stage` once and start polling. No host check.

### 3. RLS on `stage_transcripts`
- SELECT: public (already public read).
- INSERT/UPDATE: only the service role (edge functions). Remove any "host can manage" policy so the client never writes directly. This is safer than letting any wallet write.

### 4. UI (`StageTranscriptDrawer.tsx`)
- Remove host-only "Generate transcript" gating and host-only copy.
- States shown to everyone:
  - `none` → "Preparing transcript…" + auto-trigger.
  - `processing` → skeleton + "Transcribing this Stage…".
  - `ready` → speaker-labeled segments with timestamps.
  - `failed` → "Transcript unavailable" + a single "Try again" button (any user).
- Show the `FileText` icon button on every ended stage with a recording, for everyone — not just the host.

### 5. `AudioSpacesModal.tsx`
- Drop the `isHost` condition around the transcript button so all users see it.

## Technical notes
- Auth: edge function still requires a logged-in caller (JWT) but no wallet/host match.
- Cron job uses `pg_net` to invoke the edge function with the service role key (stored as a Vault secret), same pattern as other server-side automations in the project.
- No schema change needed beyond ensuring `stage_transcripts` has a unique index on `stage_id` (already created in the previous migration).
- Cost guard: the cron job processes at most N stages per run (e.g. 5) and skips any row already `processing`/`ready` to avoid duplicate ElevenLabs calls.
