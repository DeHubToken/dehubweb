

# Live TV Feature Implementation Plan

## Overview
Add a Live TV feature to the Music page (alongside Radio) that streams legally free IPTV channels using the **iptv-org** project's curated, publicly available streams.

## Data Source

### Primary: iptv-org/iptv (111k+ GitHub stars)
- **Main playlist**: `https://iptv-org.github.io/iptv/index.m3u`
- **By category**: `https://iptv-org.github.io/iptv/categories/<category>.m3u`
  - `news.m3u`, `entertainment.m3u`, `sports.m3u`, `music.m3u`, `movies.m3u`, etc.
- **By country**: `https://iptv-org.github.io/iptv/countries/<code>.m3u`
  - `us.m3u`, `gb.m3u`, `de.m3u`, etc.
- **Channel database (JSON)**: `https://iptv-org.github.io/api/channels.json` - metadata with logos, categories, languages

All channels in this repository are publicly accessible streams - no piracy involved.

## Implementation Architecture

### New Files to Create

| File | Purpose |
|------|---------|
| `src/lib/api/live-tv.ts` | API client for fetching and parsing M3U playlists + channel metadata |
| `src/components/app/tv/LiveTVSection.tsx` | Main TV section (mirrors RadioSection structure) |
| `src/components/app/tv/TVChannelCard.tsx` | Individual channel card with HLS player |
| `src/components/app/tv/TVCategoryFilter.tsx` | Horizontal scrollable category pills |
| `src/components/app/tv/index.ts` | Barrel export |
| `src/hooks/use-tv-player.tsx` | TV player context (similar to use-radio-player) |

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/app/feeds/MusicFeed.tsx` | Add "TV" sub-tab alongside Tracks, Videos, Podcasts, Radio |
| `src/hooks/index.ts` | Export `useTVPlayer` hook |
| `src/lib/video-playback-manager.ts` | Add TV stream support to single-stream enforcement |

## Technical Details

### 1. M3U Playlist Parsing (`src/lib/api/live-tv.ts`)

```text
M3U Format:
#EXTM3U
#EXTINF:-1 tvg-id="CNN.us" tvg-logo="https://..." group-title="News",CNN
https://stream.url/playlist.m3u8
```

Parse into structured data:
- `id`: Unique channel identifier  
- `name`: Channel display name
- `logo`: Channel logo URL
- `category`: Group title (News, Sports, etc.)
- `streamUrl`: HLS stream URL (.m3u8)
- `country`: Country code (extracted from tvg-id or file source)

### 2. Category Configuration

| Category | Label | Description |
|----------|-------|-------------|
| `top` | Popular | Most-watched channels |
| `news` | News | CNN, BBC, Al Jazeera, etc. |
| `sports` | Sports | ESPN variants, sports networks |
| `entertainment` | Entertainment | General entertainment |
| `music` | Music | Music TV channels |
| `movies` | Movies | Movie channels |
| `kids` | Kids | Children's programming |
| `documentary` | Documentary | Documentary channels |

### 3. HLS Playback

The streams are HLS format (.m3u8). Modern browsers handle this natively in most cases:
- **Safari/iOS**: Native HLS support
- **Chrome/Firefox/Edge**: Use native `<video>` element with HLS.js fallback if needed

Initially implement with native `<video>` element - add HLS.js polyfill only if needed for broader compatibility.

### 4. TV Player Context (`use-tv-player.tsx`)

Similar to radio player but for video:
- `currentChannel`: Currently playing channel
- `isPlaying`: Playback state
- `isLoading`: Buffering state
- `play(channel)`: Start playing a channel
- `stop()`: Stop playback
- Integration with `VideoPlaybackManager` for single-stream enforcement

### 5. UI Components

**LiveTVSection** layout:
1. Search bar ("Search 1,000+ live TV channels...")
2. Category filter pills (horizontal scroll)
3. Channel grid/list

**TVChannelCard** features:
- Channel logo with fallback
- Channel name
- Category badge
- Country flag
- Play/Stop button
- Live indicator dot
- Glass-morphism styling (matches RadioStationCard)

## User Flow

```text
User Journey:
1. User navigates to Music page
2. Clicks "TV" sub-tab (new tab between Podcasts and Radio)
3. Sees popular live channels by default
4. Can filter by category (News, Sports, etc.)
5. Can search for specific channels
6. Clicks channel card to start watching
7. Video plays inline with controls
8. Only one stream plays at a time (radio or TV)
```

## Integration Points

### Single-Stream Enforcement
When a TV channel starts playing:
1. Stop any currently playing radio station
2. Stop any currently playing video
3. Register with VideoPlaybackManager

When radio starts playing:
1. Stop any currently playing TV channel

### MusicFeed Sub-tabs Update
```text
Current: All | Tracks | Videos | Podcasts | Radio
Updated: All | Tracks | Videos | Podcasts | TV | Radio
```

## Edge Cases Handled

1. **Stream unavailable**: Show error toast, allow retry
2. **Slow connection**: Show loading spinner, buffer indicator
3. **HLS not supported**: Fall back to error message with explanation
4. **CORS issues**: Most iptv-org streams are CORS-enabled; handle exceptions gracefully
5. **Logo missing**: Show TV icon placeholder with channel initial

## Implementation Phases

### Phase 1: Core Infrastructure
- Create `live-tv.ts` API client with M3U parsing
- Create `use-tv-player.tsx` context
- Add TV categories configuration

### Phase 2: UI Components  
- Build `TVChannelCard` component
- Build `TVCategoryFilter` component
- Build `LiveTVSection` main component

### Phase 3: Integration
- Add "TV" tab to MusicFeed
- Integrate with VideoPlaybackManager
- Ensure radio/TV mutual exclusion

### Phase 4: Polish
- Add search functionality
- Add country filtering
- Optimize loading states
- Add mini-player support (optional)

