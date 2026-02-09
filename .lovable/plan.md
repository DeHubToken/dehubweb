

## Fix Post Modal Color Inconsistencies

### Problem
Three color issues in the post creation modal:
1. **Shorts destination badge** shows in green (emerald) when a video qualifies as a Short
2. **Music destination badge** shows in purple when a video is marked as music
3. **Music video toggle button** turns green (emerald) when clicked, instead of staying consistent

All of these should use the standard neutral liquid glass styling to match the rest of the UI.

### Changes

**1. `src/features/post/components/PostContentArea.tsx`** (lines 693-698)
- Remove colored badge styling for Shorts, Music, and Live destinations
- Apply uniform neutral styling (`bg-white/10 text-zinc-300`) to all destination badges, keeping them visually consistent

**2. `src/features/post/components/PostMediaPreview.tsx`** (lines 808-812)
- Change the music video toggle's active state from `bg-emerald-500/40 border-emerald-400/40` to a neutral active state like `bg-white/20 border-white/30` so it doesn't flash green when clicked

