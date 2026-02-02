
# Fix Dead Avatar in Story Playback

## Root Cause

The avatar stored in the database is a **relative path**:
```
avatars/0x742371a7cce6b068f3c6222016bf009d570d7d15.jpg
```

This needs to be processed through `buildAvatarUrl()` to become a full CDN URL:
```
https://dehubcdn.../avatars/0x742371a7cce6b068f3c6222016bf009d570d7d15.jpg
```

Currently, both `StoriesBar.tsx` and `StoryViewerModal.tsx` pass the raw `story.avatar` value directly to `<AvatarImage>`, which breaks because relative paths don't load.

---

## Changes Required

### 1. `src/components/app/cards/StoriesBar.tsx`

**Import the utility:**
```tsx
import { buildAvatarUrl } from '@/lib/media-url';
```

**Update the story mapping (around line 166-172):**
```tsx
...storyUsers.map((story) => ({
  type: 'story' as const,
  story,
  name: story.username ? `@${story.username}` : `${story.wallet_address.slice(0, 6)}...`,
  avatar: buildAvatarUrl(story.wallet_address, story.avatar) || '',  // Process through utility
  thumbnail: story.thumbnail_url || '',
})),
```

---

### 2. `src/components/app/stories/StoryViewerModal.tsx`

**Import the utility:**
```tsx
import { buildAvatarUrl } from '@/lib/media-url';
```

**Update the avatar image (around line 156-157):**
```tsx
<Avatar className="w-10 h-10 border-2 border-white">
  <AvatarImage src={buildAvatarUrl(currentStory.wallet_address, currentStory.avatar) || undefined} />
  <AvatarFallback className="bg-zinc-700 text-white">
    {(currentStory.username || currentStory.wallet_address)?.[0]?.toUpperCase()}
  </AvatarFallback>
</Avatar>
```

---

## Technical Details

The `buildAvatarUrl()` function (from `src/lib/media-url.ts`) handles:
- Relative paths like `avatars/xxx.jpg` → converts to `https://dehubcdn.../avatars/{address}.{ext}`
- Full URLs starting with `http` → returns as-is
- `null`/`undefined` → returns `undefined` (triggers fallback)

This is the same pattern used throughout the app for profile pages, feed cards, and search results per the established conventions in the codebase.

---

## Summary

| File | Change |
|------|--------|
| `StoriesBar.tsx` | Add import + wrap `story.avatar` with `buildAvatarUrl()` |
| `StoryViewerModal.tsx` | Add import + wrap `currentStory.avatar` with `buildAvatarUrl()` |
