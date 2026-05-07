# Stage Transcript Drawer — Phase 2

Build out the remaining transcript features inside the existing `StageTranscriptDrawer` (no tabs refactor). Adds an inline player, translation, search, AI summary + chapters, quote-to-post, speaker rename, privacy, and download/copy actions.

## 1. Database

New columns / tables (single migration):

- `stage_transcripts`
  - `summary text` — AI-generated recap
  - `chapters jsonb default '[]'` — `[{ title, start, end }]`
  - `speaker_overrides jsonb default '{}'` — host renames: `{ speaker_0: { username, wallet? } }`
  - `privacy text default 'public'` — `'public' | 'members' | 'private'`
  - `summary_status text default 'pending'` — `pending | processing | ready | failed`
- `stage_transcript_translations` — cache, one row per `(stage_id, language)`
  - `stage_id uuid`, `language text`, `segments jsonb`, `summary text`, `chapters jsonb`, `created_at timestamptz`
  - Unique `(stage_id, language)`. Public select; service-role write.
- RLS update on `stage_transcripts` SELECT: gate by `privacy` — `public` always, `private` only host, `members` left as public for now (no community membership concept on a stage; future-proof).

## 2. Edge functions

- **`transcribe-stage`** (existing) — after writing `segments`, also enqueue summary job by setting `summary_status = 'processing'` and calling `summarize-transcript` (fire-and-forget) so summary + chapters appear shortly after the transcript.
- **`summarize-transcript`** (new) — Lovable AI `google/gemini-3-flash-preview`. Input: full transcript with timestamps and speaker labels. Output JSON: `{ summary: string, chapters: [{ title, start, end }] }`. Writes back to `stage_transcripts`. Idempotent; skip if already `ready` unless `force`.
- **`translate-transcript`** (new) — Lovable AI `google/gemini-3-flash-preview`. Input: `{ stageId, language }`. Loads original `segments` + `summary` + `chapters`, asks model to translate per-segment text (preserve indices/timestamps) and the summary/chapter titles, returns JSON. Caches in `stage_transcript_translations`. Idempotent on `(stage_id, language)` unless `force`.

All three use the existing CORS pattern, service-role client, and `EdgeRuntime.waitUntil` for background work.

## 3. Drawer UX (`src/components/app/spaces/StageTranscriptDrawer.tsx`)

Layout, top-to-bottom inside the existing liquid-glass drawer:

```text
┌─────────────────────────────────────────────────────┐
│ Header: title • [privacy chip if host] • [X]        │
├─────────────────────────────────────────────────────┤
│ Inline audio player (sticky)                        │
│  ▷  ──────●─────────  03:42 / 27:11  vol            │
├─────────────────────────────────────────────────────┤
│ AI summary (collapsible) + chapter chips ⏵          │
├─────────────────────────────────────────────────────┤
│ 🔍 search • 🌐 lang picker (src→tgt) • ⋯ menu       │
│   menu: Copy · Download .txt · Download .srt · Share│
├─────────────────────────────────────────────────────┤
│ ScrollArea                                          │
│   [skeleton segments while processing]              │
│   speaker header (avatar/name/AI badge) • ts        │
│   text … select → floating "Quote as post"          │
└─────────────────────────────────────────────────────┘
```

Interactions:

- **Inline player**: native `<audio src={recording_url}>` wrapped in custom controls; expose `currentTime` and `seekTo()` via a small `useAudioPlayer` hook so segment timestamps and chapter chips become click-to-seek; the active segment auto-highlights.
- **Language picker**: source (auto-detected, read-only) and target dropdown listing common languages + the user's `preferred_language` from settings auto-selected. Switching target loads from `stage_transcript_translations` cache or invokes `translate-transcript` and shows skeletons until ready.
- **Search**: client-side filter over current (translated or original) `segments` — substring match, debounced 150ms, highlights matches.
- **AI summary + chapters**: render summary above transcript; chapter chips horizontally scrollable, click to seek to `start`. If `summary_status !== 'ready'`, show a small "Summarising…" pill (do not block transcript).
- **Quote as post**: on text selection inside a segment, show a floating glass button "Quote as post". Click → opens existing composer prefilled with `> {quoted text}\n\n{stageDeepLink}#t={start}` (use existing composer event/route pattern; identify the right entrypoint during implementation).
- **Speaker rename (host only)**: small pencil icon next to the speaker header opens a popover to type a username (autocomplete via `useDehubUserSearch`). Saves to `stage_transcripts.speaker_overrides`. Renames apply across the whole transcript and translated views (override wins over `speaker_map` and "Speaker N").
- **Privacy toggle (host only)**: chip in header — Public / Members / Private. Updates `stage_transcripts.privacy`. RLS handled by migration.
- **Copy / Download .txt / Download .srt / Share quote**: in `⋯` menu. SRT generated client-side from segments. Share quote = copy a deep link to the stage with `?t=` timestamp.
- **Skeletons while transcribing**: render 6 placeholder segment cards instead of single spinner during `pending`/`processing`.

## 4. Hooks & utilities

- `useStageTranscript(stageId, language)` — wraps the existing query, picks translated segments when `language !== source_language`, and triggers `translate-transcript` on first miss.
- `useStageSummary(stageId)` — query for `summary` + `chapters` + `summary_status`; auto-invalidates on realtime update.
- `useAudioPlayer({ src })` — exposes `play`, `pause`, `seekTo`, `currentTime`, `duration`, `isPlaying`. Single shared instance inside the drawer; cleans up on close.
- `formatSrt(segments)` and `formatTxt(segments)` helpers in `src/lib/transcript-format.ts`.

## 5. Realtime

Subscribe (inside the drawer) to `stage_transcripts` row updates and `stage_transcript_translations` inserts for the current `stage_id` so summary, chapters, translation, and rename changes appear without manual refetches.

## 6. Out of scope / explicit non-goals

- No tabs refactor of the Stage detail view (drawer stays).
- No editing transcript text (only speaker rename).
- "Members" privacy is wired but currently behaves like `public` until stages get a real membership model.

## Technical notes

- All new UI strictly follows liquid-glass tokens: `bg-black/60 backdrop-blur-[24px] border-white/10`, white / white-opacity text, no blue, primary buttons `rounded-2xl`, secondary `rounded-xl`, controls `rounded-lg`/`md`.
- Translations and summaries always run server-side via Lovable AI Gateway (`LOVABLE_API_KEY`, no extra secrets needed).
- Existing legacy auto-rerun (`force: true` once on open) stays; new fields will populate on the next run.
- Add `stage_transcripts` and `stage_transcript_translations` to `supabase_realtime` publication.
- TypeScript types regenerate automatically after the migration.
