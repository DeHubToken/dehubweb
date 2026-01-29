
# Radio Section for Music Tab

## Overview
Add a live radio streaming feature to the Music tab using the free **Radio Browser API** (https://api.radio-browser.info). This API provides access to 50,000+ radio stations worldwide with no API key required, no rate limits, and completely free to use.

## What You'll Get

### Radio Tab in Music Page
- A new "Radio" tab alongside existing Tracks, Videos, Podcasts, and Live tabs
- Browse stations by genre (Pop, Rock, Jazz, Electronic, Hip-Hop, etc.)
- Search for specific stations by name
- See station info: name, country flag, current genre tags, bitrate quality

### Persistent Mini-Player
- A floating audio player at the bottom of the screen when a station is playing
- Shows station name, logo, play/pause control, and volume slider
- Stays visible while browsing other content
- Smooth animations when appearing/disappearing

### Station Cards
- Glass-morphism styled cards matching the app's liquid glass aesthetic
- Station logo/favicon with fallback icon
- Country flag and genre tags
- Click to play, with visual "now playing" indicator

---

## Technical Approach

### New Files

| File | Purpose |
|------|---------|
| `src/lib/api/radio-browser.ts` | API client for Radio Browser endpoints |
| `src/hooks/use-radio-player.ts` | Global audio player state management |
| `src/components/app/radio/RadioStationCard.tsx` | Individual station card component |
| `src/components/app/radio/RadioGenreFilter.tsx` | Genre pill filter bar |
| `src/components/app/radio/RadioMiniPlayer.tsx` | Persistent floating player |
| `src/components/app/radio/RadioSection.tsx` | Main radio content section |
| `src/components/app/radio/index.ts` | Barrel export |

### Modified Files

| File | Change |
|------|--------|
| `src/pages/app/MusicPage.tsx` | Add "Radio" tab and render RadioSection |
| `src/components/app/AppLayout.tsx` | Include RadioMiniPlayer in layout |

---

## API Integration

### Radio Browser API Endpoints (No API Key Required)

```
Base URL: https://de1.api.radio-browser.info/json
```

| Endpoint | Purpose |
|----------|---------|
| `/stations/bytag/{tag}` | Get stations by genre tag |
| `/stations/search?name={query}` | Search stations by name |
| `/stations/topvote` | Get popular stations |
| `/tags` | Get available genre tags |

### Station Data Structure
```typescript
interface RadioStation {
  stationuuid: string;
  name: string;
  url_resolved: string;  // Stream URL
  favicon: string;       // Station logo
  country: string;
  countrycode: string;
  tags: string;          // Comma-separated genres
  bitrate: number;
  votes: number;
}
```

---

## User Experience Flow

1. User navigates to Music → Radio tab
2. Sees genre filter pills (Pop, Rock, Jazz, etc.) and search bar
3. Scrolls through station cards with station info
4. Taps a station → Mini-player appears, stream starts
5. Can continue browsing while audio plays
6. Tap mini-player pause to stop, or tap a new station to switch

---

## UI Design

### Genre Filter Bar
- Horizontal scrollable pill buttons
- Active genre highlighted with `bg-zinc-800`
- Icons for each genre (optional)

### Station Card (Glass Style)
```
┌─────────────────────────────────────────┐
│  [Logo]  Station Name            ▶ Play │
│          🇺🇸 Pop, Top 40 • 128kbps      │
└─────────────────────────────────────────┘
```

### Mini-Player (Fixed Bottom)
```
┌─────────────────────────────────────────┐
│ [Logo] Now Playing: Station    ⏸ 🔊━━━━ │
└─────────────────────────────────────────┘
```

---

## Implementation Details

### Radio Player Hook
- Uses `React.Context` for global state
- Single `Audio` element for playback
- Exposes: `play(station)`, `pause()`, `setVolume()`, `currentStation`, `isPlaying`
- Handles stream errors gracefully with toast notifications

### Error Handling
- Fallback icon for missing station logos
- "Stream unavailable" message if URL fails
- Loading skeleton while fetching stations

### Performance
- `useQuery` with 5-minute stale time for station lists
- Lazy load station images
- Debounced search input

---

## Dependencies
- No new packages needed
- Uses existing: `@tanstack/react-query`, `lucide-react`, `framer-motion`
