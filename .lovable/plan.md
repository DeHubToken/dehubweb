

## Show Thumbnail Instead of Blur on PPV Locked Videos

**Problem**: When a video is PPV-locked and has a thumbnail/cover image, it currently shows a blurred version of that image. It should show the thumbnail clearly so users can see what they're paying for.

**Fix**: Remove the `blur-xl scale-110` classes from the thumbnail `<img>` on line 963 of `VideoCard.tsx`, and reduce the dark overlay opacity so the cover image is clearly visible while still showing the lock/unlock UI on top.

### Changes

**File: `src/components/app/cards/VideoCard.tsx`** (line 963)

Change:
```tsx
className="w-full h-full object-cover blur-xl scale-110"
```

To:
```tsx
className="w-full h-full object-cover"
```

And reduce the overlay darkness from `bg-black/50` to `bg-black/30` (line 967) so the thumbnail is more visible behind the lock icon.

That's it -- one line class change, one overlay opacity tweak.

