

# Add Radio Section to Home Page Music Tab

## Problem
The Radio feature was incorrectly placed in the separate Music page (`/app/music`) instead of the **Music tab on the Home page** (`/app`). You're on the correct page, but the MusicFeed component is just showing "No music content yet" with empty sub-tabs.

## Solution
Integrate the `RadioSection` component into the `MusicFeed` component, replacing the current "Live" sub-tab with "Radio" - so when you click the Music tab on the Home page and tap "Radio", you'll see the radio stations.

---

## Changes Required

### 1. Update MusicFeed Component
**File:** `src/components/app/feeds/MusicFeed.tsx`

**Changes:**
- Replace the "Live" sub-tab with "Radio" sub-tab using `Radio` icon from lucide-react
- Import and render the `RadioSection` component when "radio" sub-tab is active
- Keep the empty states for other sub-tabs (tracks, videos, podcasts) until they have real API data

### Updated Sub-Tab Structure:
| Tab | Icon | Content |
|-----|------|---------|
| All | Music | Empty state (future: all music content) |
| Tracks | Disc3 | Empty state (future: audio tracks) |
| Videos | Play | Empty state (future: music videos) |
| Podcasts | Mic2 | Empty state (future: podcasts) |
| **Radio** | Radio | **RadioSection with live streaming stations** |

---

## User Experience After Fix

1. Navigate to Home page (`/app`)
2. Tap the **Music** tab (play icon) in the tab bar
3. Tap the tab again to show sub-tabs OR sub-tabs will be visible
4. Select **Radio** sub-tab
5. See the full radio experience: search bar, genre filters, station cards
6. Tap any station to start streaming with persistent mini-player

---

## Technical Details

```tsx
// Updated sub-tabs in MusicFeed.tsx
type MusicSubTab = 'all' | 'tracks' | 'videos' | 'podcasts' | 'radio';

const MUSIC_SUB_TABS = [
  { icon: Music, label: 'All', value: 'all' },
  { icon: Disc3, label: 'Tracks', value: 'tracks' },
  { icon: Play, label: 'Videos', value: 'videos' },
  { icon: Mic2, label: 'Podcasts', value: 'podcasts' },
  { icon: Radio, label: 'Radio', value: 'radio' }, // Changed from 'live'
];

// Conditional render in MusicFeed
{activeSubTab === 'radio' ? (
  <RadioSection />
) : (
  <EmptyState type={getEmptyLabel()} />
)}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/app/feeds/MusicFeed.tsx` | Add Radio sub-tab and render RadioSection |

No new files needed - the RadioSection component already exists and works.

