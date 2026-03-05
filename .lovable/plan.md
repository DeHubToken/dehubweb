

## Why Audio Posts Don't Play

The @chaos post (tokenId 3191) returns from the API with `postType: "feed-audio"` and `audioUrl: "feed-audio/3191-audio.m4a"`, but the app has three cascading bugs:

1. **Wrong postType check**: Code checks for `postType === 'audio'` but API sends `"feed-audio"`
2. **Missing audioUrl field**: Neither `UnifiedFeedItem` nor `DeHubNFT` types include `audioUrl` or `audioDuration`, so the actual audio URL is silently dropped
3. **Wrong URL construction**: Even the "audio" branch builds a `.mp4` CDN URL (`videos/3191.mp4`) instead of using the real audio URL (`feed-audio/3191-audio.m4a`), causing the `MEDIA_ELEMENT_ERROR: Format error` in console
4. **No audio rendering path**: VideoCard has no code path to render an `<audio>` element with waveform/visualizer for audio posts

---

### Plan

**1. Fix postType detection across all mappers**

- In `use-dehub-feed.ts`: `getContentType()` — add `"feed-audio"` as an audio type
- In `use-dehub-feed.ts`: `mapNFTToVideoItem()` — check `postType === 'feed-audio'` alongside `'audio'`
- In `use-unified-feed.ts`: Add `'feed-audio'` to the `UnifiedFeedItem.postType` union
- In `use-dehub-profile.ts`: Same fix for profile feed mapper

**2. Add audioUrl/audioDuration to types**

- `UnifiedFeedItem`: add `audioUrl?: string` and `audioDuration?: number`
- `DeHubNFT` type (in `src/lib/api/dehub/types.ts`): add `audioUrl?: string` and `audioDuration?: number`
- `VideoItem` type (in `src/types/feed.types.ts`): add `audioUrl?: string` and `audioDuration?: number` and `isAudio?: boolean`

**3. Fix URL construction in mappers**

- For audio posts, resolve the CDN URL from `nft.audioUrl` field: `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${audioUrl}`
- Pass this as `audioUrl` on the mapped `VideoItem` instead of trying to use `videoUrl`
- Use `audioDuration` for duration formatting on audio posts

**4. Add audio playback in VideoCard**

- When `item.isAudio` is true, render an audio player with the `AudioVisualizer` component (already exists in the codebase) instead of a `<video>` element
- Show the thumbnail/cover art as background, with waveform overlay and play/pause control
- Use `recordListen(tokenId)` API call when audio plays (already wired in `feed.ts`)

**5. Fix unified feed filtering**

- Ensure `feed-audio` posts are not accidentally filtered out (currently the feed query doesn't filter by postType for the home feed, so they come through — but the mapper drops them into the video path which fails)

