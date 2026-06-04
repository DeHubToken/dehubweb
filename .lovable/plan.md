## Goal

Subtitles currently render full utterances as 2–3 long lines that sit on screen for several seconds. Switch to a "karaoke-style" flow: one short line at a time (~max ~38 chars / ~6–8 words), each shown for its proportional share of the original cue's duration.

## Approach

Add a small pure helper `splitSegmentIntoLines(segment, maxChars)` in `src/lib/transcript-format.ts` (already exists for related work) that:
- Breaks `segment.text` into chunks at word boundaries, each ≤ ~38 chars.
- Avoids orphan single words by merging trailing tiny chunks.
- Returns `TranscriptSegment[]` with start/end times distributed proportionally by character length across the chunks, preserving the segment's total span.

Apply it in two places in `src/components/app/video/VideoSubtitleOverlay.tsx`:

1. **Custom overlay path (translations)** — when building `activeSegments`, flat-map every segment through the splitter before timing. The existing rAF ticker already advances `indexRef` automatically, so each short line replaces the previous one on time.

2. **Native `<track>` path (original)** — replace the raw `vtt_original` blob with a re-chunked VTT:
   - Parse cues from `transcript.vtt_original` (simple regex: timestamp line `hh:mm:ss.mmm --> hh:mm:ss.mmm` + text lines).
   - Run each cue's text through the same splitter to get sub-cues.
   - Emit a new VTT string and build the blob URL from that.
   - Memoize on `vtt_original` so it only re-parses when the cached VTT changes.

No edge function or DB changes — purely client-side reformatting of cached transcripts, so already-transcribed videos benefit immediately with no re-fetch and no extra cost.

## Tuning

- `maxChars` default `38` (fits comfortably on mobile in one line at XS-M sizes).
- Minimum cue duration of 0.6s; if proportional split would go below that, merge neighbors so very fast speech doesn't strobe.

## Files

- Edit: `src/lib/transcript-format.ts` — add `splitSegmentIntoLines` + `rechunkVtt` helpers (pure, unit-testable).
- Edit: `src/components/app/video/VideoSubtitleOverlay.tsx`
  - Use `splitSegmentIntoLines` when computing `activeSegments`.
  - Use `rechunkVtt` when computing `vttBlobUrl`.

## Verification

1. Play a video with the original language captions → confirm each line flips one at a time, no 2–3 line blocks.
2. Switch to a translated language (e.g. Spanish) → same behavior via overlay path.
3. Scrub forward/back → lines re-sync without duplicate or stuck text.
4. Try sizes XS → XXL → still one line, still legible.

## Out of scope

- Server-side transcript reformatting (not needed; client splitter is sufficient).
- Word-level highlighting / karaoke fill.
