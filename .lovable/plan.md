

# Play Sound Over Upload — Overlay Approach

## How It Works

Instead of muxing audio into the video file, we **play a hidden `<audio>` element in sync with the `<video>` element**. When a post has an attached soundtrack, the player:

1. **Mutes the video's original audio** and plays the soundtrack `<audio>` element simultaneously
2. **Syncs play/pause/seek** — when the video pauses, the audio pauses; when the user seeks, the audio seeks to the same timestamp
3. **Trims to shortest** — if the soundtrack is shorter than the video, it stops; if longer, it stops when the video ends

## Will It Feel Native?

**Yes, for the viewer it's seamless:**
- Both elements start/pause/seek together — no perceptible delay (they share the same `timeupdate` event loop)
- The video player controls (play, pause, seek bar, volume) control both simultaneously
- A small "♪ Track Name" badge appears on the video (like TikTok/Reels) so viewers know a sound is attached
- Volume slider controls the soundtrack audio, video's own audio is muted

**Edge cases handled:**
- Buffering: if audio buffers, video waits (and vice versa) via `waiting`/`playing` events
- Seek: `seeked` event on video triggers `audio.currentTime = video.currentTime`
- Loop: if video loops, audio restarts from 0

## What Gets Built

### 1. Sound Picker Component
- Bottom sheet to browse/search DeHub audio posts via `searchNFTs({ postType: 'audio' })`
- Inline preview playback, select to attach

### 2. Post Form State
- New state: `attachedSound: { url, title, creator, tokenId } | null`
- Stored as metadata alongside the post (not as a file upload)

### 3. Post Submission
- Include `soundtrackTokenId` or `soundtrackUrl` in the mint payload metadata (description or streamInfo)
- The soundtrack reference is stored in the post's metadata so the player knows to load it

### 4. Video Player Enhancement
- When a post has an attached soundtrack URL, render a hidden `<audio>` element
- Sync its playback with the video element using event listeners
- Show a "♪ Track Name" overlay badge on the video
- Mute the video's native audio track

### 5. Feed/Single Post Page
- Feed normalizer extracts soundtrack metadata from post description/metadata
- Passes `soundtrackUrl` prop to the video player component

## Technical Sync Logic (Simple)
```text
video.onplay   → audio.play()
video.onpause  → audio.pause()
video.onseeked → audio.currentTime = video.currentTime
video.onended  → audio.pause(); audio.currentTime = 0
```

## Files
- **New**: `src/features/post/components/SoundPicker.tsx`
- **New**: `src/features/post/hooks/usePostSound.ts`  
- **New**: `src/hooks/use-synced-audio.ts` — reusable hook for audio-video sync
- **Edit**: Video player component — add synced audio support + badge
- **Edit**: Post form — add sound picker trigger + state
- **Edit**: Feed normalizers — extract soundtrack metadata

