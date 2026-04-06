

## Plan: Post AI-Generated Audio as Actual File (Not Link)

### Problem
Currently, clicking the Post/Share button on a generated audio track opens the post modal with just a text string containing the fal.ai URL. This results in a link post, not an actual audio post.

### Solution
Fetch the audio file from the fal.ai URL, convert it to a `File` object, and pass it to the post modal as an actual audio file attachment — the same way the AI Chat's image posting works.

### Changes

**1. `src/hooks/use-global-drop-zone.tsx`**
- Add an `openPostModalWithFiles` function that accepts a `FileList` + optional text, sets `pendingFiles`, and opens the modal.
- Expose it in the context.

**2. `src/components/app/assistant/GeneratedAudioPlayer.tsx`**
- Replace the current `openPostModal` text-only call with logic that:
  1. Fetches the audio URL as a blob
  2. Creates a `File` object (`dehub-audio.mp3`, type `audio/mpeg`)
  3. Uses `DataTransfer` to create a `FileList`
  4. Calls `openPostModalWithFiles` to open the post modal with the actual audio file attached
- Add a loading state on the Share button while fetching

This ensures the audio is posted as an actual playable audio file in the feed, not a URL link.

