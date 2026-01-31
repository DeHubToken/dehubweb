

# Fix: Filter Broken Videos That Don't Play

## Problem
The video "Ninguém Explica Deus.mp4" by iamsandeep/Alan Vieira appears in the Music tab even though it doesn't play. The current filtering only catches:
- Specific blocked wallet addresses
- URLs with obviously broken patterns (containing "undefined", "null", etc.)

This video has valid-looking URLs but the actual media file is corrupted or broken.

## Solution Approach

Since we can't detect at fetch time if a video is playable (that requires actually loading it), there are two complementary strategies:

---

### Strategy 1: Block Known Broken Content Creators
Add the wallet address of "iamsandeep" (the uploader of the broken video) to the `BLOCKED_MINTERS` list in `MusicFeed.tsx`.

**Files to modify:**
| File | Change |
|------|--------|
| `src/components/app/feeds/MusicFeed.tsx` | Add iamsandeep's wallet address to `BLOCKED_MINTERS` |

**Note:** I'll need the wallet address for this account. It should be visible in the app when viewing their content, or can be found by checking the API response. If you can provide it, I can add it immediately.

---

### Strategy 2: Runtime Video Error Detection (Optional Enhancement)
Add error handling to the video player components that marks videos as "broken" when they fail to load, and use that to filter them from appearing again.

This would involve:
1. Track video load/play errors in `InlineVideoCard` and `VideoCard`
2. Store broken video IDs in localStorage or app state
3. Filter out known-broken videos before rendering

**Trade-offs:**
- More comprehensive but complex
- Videos still show once before being marked broken
- Would need persistent storage to remember across sessions

---

## Recommended Approach

**Start with Strategy 1** - block the specific minter address. This is immediate and handles the reported issue.

If more broken videos appear from different uploaders, we can discuss adding the runtime detection system.

---

## What I Need From You
Please share the wallet address of "iamsandeep" so I can add it to the blocked list. You can find this by:
- Clicking on their profile in the app
- Or the full URL when viewing their content

