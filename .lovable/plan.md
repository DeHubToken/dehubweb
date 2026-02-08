

# Add 5 Template Stories as Fallback Content

## Overview
Add 5 template stories from fictional template accounts that appear in the stories bar when no real (non-expired) stories exist. These act as placeholder content to make the app feel alive until real users start posting stories. Once any real story is active, the templates disappear.

## Approach: Frontend Fallback (No Database Changes)

Rather than inserting fake records into the database (which would require managing expiration, pollute real data, and complicate cleanup), the template stories will live as hardcoded fallback data in the `useStories` hook. This is:
- Easy to remove later (delete one array)
- No database pollution
- No expiration management needed
- Automatically hidden when real stories exist

## Template Accounts

Five template accounts with distinct personas:

| Username | Display Style | Avatar |
|----------|--------------|--------|
| @alex_streams | Gamer/streamer vibe | Generated gradient fallback |
| @maya_creates | Creative/art content | Generated gradient fallback |
| @kai_fitness | Fitness/lifestyle | Generated gradient fallback |
| @luna_music | Music/audio content | Generated gradient fallback |
| @dev_marco | Tech/coding content | Generated gradient fallback |

Each will use a unique fake wallet address (e.g., `0xTEMPLATE0001...`) so the stories group correctly per user.

## Video Content

The template stories will use short, publicly available stock video clips (selfie/POV style from free video CDNs like Pexels). These are royalty-free MP4 files that work natively with the `<video>` tag.

## Technical Details

### File Changes

**1. `src/hooks/use-stories.ts`**
- Add a `TEMPLATE_STORIES` constant array with 5 `Story` objects
- Each has a unique `id`, fake `wallet_address`, `username`, `video_url` (public stock video), and `avatar` set to `null` (will show letter fallback)
- In the `useStories` hook, when `stories` returns empty (no active real stories), return the template stories instead
- The `enrichedStories` query skips avatar fetching for template addresses (they won't exist in DeHub API)

**2. `src/components/app/cards/StoriesBar.tsx`**
- No changes needed -- it already renders stories from the hook
- Template stories will have the gradient ring and show thumbnail/avatar like real stories
- Clicking a template story opens the StoryViewerModal normally

### Logic Flow

1. `useStories` fetches from database as usual
2. If no active stories are returned, substitute the 5 template stories
3. Template stories behave identically to real ones in the viewer (play video, show username, allow scrolling)
4. As soon as a real story is posted and active, templates are hidden entirely

### Template Story Structure
Each template story will follow the existing `Story` interface:
```
{
  id: 'template-1',
  wallet_address: '0xTEMPLATE000000000000000000000000000001',
  username: 'alex_streams',
  avatar: null,
  video_url: 'https://videos.pexels.com/...selfie-clip.mp4',
  thumbnail_url: null,
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86400000).toISOString(),
}
```

### Cleanup
When no longer needed, simply delete the `TEMPLATE_STORIES` array and the fallback conditional -- one small change in `use-stories.ts`.

