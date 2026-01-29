

# Remove Duplicate Filter Toggle from Mobile Tab Bar

## Current State

The sticky tab bar on the Home page has two buttons on the right side:
1. **Filter Button** (`SlidersHorizontal` icon) - second-to-last position
2. **Settings Button** (`Settings2` icon) - far right position

You've asked to remove the filter button and keep only the settings button on the far right.

## Implementation

### File: `src/pages/app/HomePage.tsx`

**Remove lines 371-385** - Delete the entire filter button block:

```tsx
{/* Filter Button - contextual to active tab */}
{['home', 'videos', 'shorts', 'images', 'music'].includes(activeTab) && (
  <button
    onClick={() => handleTabClick(activeTab)}
    className={cn(
      'flex items-center justify-center px-3 py-2 rounded-xl text-white transition-colors',
      (showHomeFilters || showVideosFilters || showShortsFilters || showImagesCollage || showMusicFilters)
        ? 'bg-zinc-800'
        : 'hover:bg-white/5'
    )}
    aria-label="Toggle filters"
  >
    <SlidersHorizontal className="w-4 h-4" />
  </button>
)}
```

**Also clean up the unused import on line 12:**

Remove `SlidersHorizontal` from the import statement:
```tsx
// Before:
import { Settings2, SlidersHorizontal } from 'lucide-react';

// After:
import { Settings2 } from 'lucide-react';
```

## Result

After this change, the tab bar will show:
- Tab icons on the left
- Settings button (gear icon) on the far right only
- No duplicate filter toggle

Note: Users can still access filters by tapping on the same tab again (existing behavior in `handleTabClick`).

