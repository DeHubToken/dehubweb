## Goal

Add an optional **CC (subtitle) button** to every video player. When enabled, render synced subtitles from the existing transcript. Let users pick **any language** — translations are generated on demand and cached.

## UX

- **CC button**: small icon overlay (bottom-right of the player, near existing controls). Hidden when no `tokenId`/transcript exists.
- **States** on the button:
  - Greyed out → no transcript yet. Tap → triggers transcript generation (same flow as Post Info), then auto-enables.
  - Idle → transcript ready, subtitles off.
  - Active (filled) → subtitles on, captions render at bottom of video.
- **Long-press / second tap** opens a small popover:
  - Toggle CC on/off
  - Language picker (searchable list of ~30 common languages + "Original")
  - "Auto-detect from your locale" option (uses `navigator.language` once)
- **Caption rendering**: bottom-center, max 2 lines, drop-shadow + `bg-black/50` rounded pill, `text-white`, scales with player size, hides on hover-controls collision.
- **Persistence**: chosen language + enabled-state stored in `localStorage` (`video-subs:lang`, `video-subs:enabled`).

## Sync logic

- Read `segments[]` (`{start, end, text}`) already cached on `video_transcripts`.
- On each `timeupdate` (throttled ~4x/sec), find the segment where `start ≤ currentTime < end` and show its text. Binary-search by index pointer for O(1) lookups during playback.
- If language ≠ original, look up `translated_segments[lang][i].text` instead.

## Translation pipeline

New edge function **`translate-transcript`**:
- Input: `{ tokenId, lang }` (BCP-47 like `es`, `fr`, `ja`).
- If `video_transcripts.translations->lang` exists → return cached.
- Else: call Lovable AI (`google/gemini-2.5-flash-lite`) with the full segment array and a strict tool-call schema returning `{ segments: [{ i, text }] }` preserving order/count. Chunk in groups of ~80 segments to stay within token limits, with retry on count mismatch.
- Persist into a new `translations jsonb` column on `video_transcripts`, keyed by language code.
- Returns translated segment array.

Client hook **`useVideoSubtitles(tokenId, lang)`**:
- React Query: fetch transcript row; if `lang !== 'original'`, invoke `translate-transcript` and merge.
- Loading toast / spinner on the CC button while translating.

## Schema change

```sql
ALTER TABLE public.video_transcripts
  ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Shape: `{ "es": [{start, end, text}, ...], "fr": [...] }`.

## Components

New shared component **`<VideoSubtitleOverlay tokenId videoRef />`**:
- Absolutely-positioned layer placed inside any video container.
- Owns CC button, popover (uses `Popover` shadcn primitive), language list, caption renderer.
- Listens to the passed `videoRef.current` for `timeupdate`/`seeked`/`ratechange`.

Wired into:
- `src/components/app/AutoplayVideo.tsx`
- `src/components/app/cards/VideoCard.tsx`
- `src/components/app/cards/VideoSlide.tsx`
- `src/components/app/stories/StorySlide.tsx`
- `src/components/app/tv/FloatingPiPPlayer.tsx`
- Immersive video overlay
- Each accepts an optional `tokenId` prop; overlay no-ops when absent.

## Files

- New: `supabase/functions/translate-transcript/index.ts`
- New: `src/components/app/video/VideoSubtitleOverlay.tsx`
- New: `src/hooks/use-video-subtitles.ts`
- New: `src/lib/subtitle-languages.ts` (~30 language code/name pairs)
- Edit: video player components above to mount the overlay
- Migration: add `translations` column
- Memory: add `mem://features/video/subtitles-system` rule (CC button everywhere, on-demand translation cached per language, localStorage persistence)

## Out of scope

- Embedding subtitles into the video file
- Real-time speech translation (uses stored transcript only)
- Subtitle styling customization (font size / colour pickers)
