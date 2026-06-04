## Goal

Replace the Gemini-based transcription with **Deepgram Nova-3** (purpose-built ASR with word-level timestamps and native VTT output) and let the browser render original-language subtitles via the native `<track>` element. Keep the existing custom overlay only for translated languages and the size picker.

## Why Deepgram

- Word-level timestamps → perfect sync (vs. Gemini's drifting sentence-level guesses)
- Returns SRT/VTT natively → no fragile JSON parsing
- Auto language detection on source → fixes the en→en translation bug class
- ~$0.0043/min, fast (real-time factor ~40x)
- One API call, no chunking gymnastics

## Architecture

```text
Original captions  →  Deepgram VTT  →  <track> on <video>  (browser-native sync)
Translated captions →  Gemini per-line  →  custom overlay   (existing path)
```

## Changes

### 1. Secret
- Add `DEEPGRAM_API_KEY` (request from user; they create at deepgram.com → API Keys).

### 2. DB migration
- `ALTER TABLE video_transcripts ADD COLUMN vtt_original text` (cached VTT)
- `ALTER TABLE video_transcripts ADD COLUMN source_lang text` (detected language code)
- Keep existing `transcript` (segments JSON) and `translations` jsonb — still used for non-original languages.

### 3. Edge function: rewrite `transcribe-video`
- Replace Gemini call with a single POST to `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&detect_language=true&utterances=true&paragraphs=true`
- Body: `{ url: buildVideoUrl(tokenId) }` (Deepgram fetches the MP4 directly — no upload).
- Parse response:
  - `vtt` from a second call with `&format=vtt` OR build VTT from `results.utterances` (word-grouped).
  - `source_lang` from `results.channels[0].detected_language`.
  - `segments[]` derived from utterances for backward compatibility with the translation pipeline.
- Persist `vtt_original`, `source_lang`, `transcript: { segments, full_text }`.
- Drop the chunked-retry loop entirely; Deepgram handles hours-long files in one call.

### 4. Edge function: `translate-transcript` (small tweak)
- Read `source_lang`. If requested `lang` equals `source_lang`, return original segments without calling the AI. Eliminates the "translate en→en" failure mode at the server level too.

### 5. Client: `VideoSubtitleOverlay.tsx`
- Add prop `videoElement: HTMLVideoElement | null` (already has `videoRef`).
- When `normalizedLang === 'original'` AND `vtt_original` exists:
  - Inject/replace a `<track kind="subtitles" src={blobUrl(vtt)} srclang={sourceLang} default>` onto the video element.
  - Set `videoElement.textTracks[0].mode = 'showing'` (or `'hidden'` when CC off).
  - Hide the custom caption layer — browser renders.
- When language is a translation:
  - Remove the native track (set `mode = 'disabled'`), render custom overlay as today (it already works fine for translations because timestamps come straight from utterances).
- Size picker still works — for native captions we apply it via the standard `::cue { font-size: ... }` injected stylesheet; for custom overlay it works as today.

### 6. Hook: `useVideoSubtitles`
- Extend return to include `vttUrl` (object URL built from `vtt_original`) and `sourceLang`.
- Memoize blob URL; revoke on unmount/lang change.

### 7. Migrate existing rows
- Any pre-existing `video_transcripts` rows without `vtt_original` keep working via the legacy overlay path. New transcripts use Deepgram. No backfill needed; users can re-trigger transcription on demand.

## Verification before delivering

1. Trigger transcription on a known token via the CC button.
2. Inspect DB: `vtt_original` non-null, `source_lang` populated, `transcript.segments` populated.
3. In preview: enable CC original → confirm captions render via native `<track>` (visible in DevTools `<video>` element), perfectly synced.
4. Switch to Spanish/French → confirm overlay path renders translated text, no en→en garbage.
5. Test size picker on both original (native `::cue`) and translated (overlay span) modes.
6. Scrub video forward/back, check sync stays tight.

## Files

- New migration: add `vtt_original`, `source_lang` columns
- Edit: `supabase/functions/transcribe-video/index.ts` (rewrite core to Deepgram)
- Edit: `supabase/functions/translate-transcript/index.ts` (short-circuit when lang === source_lang)
- Edit: `src/hooks/use-video-subtitles.ts` (expose vtt + source lang)
- Edit: `src/hooks/use-video-transcript.ts` (select new columns)
- Edit: `src/components/app/video/VideoSubtitleOverlay.tsx` (native track mounting + `::cue` size)
- Memory update: `mem://features/video/subtitles-system` → reflect Deepgram + native track standard

## Out of scope

- Backfilling old transcripts (re-run on demand)
- Diarization / speaker labels
- Replacing Gemini translation with DeepL (can be a follow-up)

## Needs from user

- `DEEPGRAM_API_KEY` — sign up at deepgram.com, create an API key with default scope. I'll request it via the secrets tool once you approve this plan.