
## Plan: Full ElevenLabs Voice Library with Search

### What Changes

**1. New Edge Function: `elevenlabs-voices`**
- Proxies `GET https://api.elevenlabs.io/v2/voices` with search/filter params
- Accepts query params: `search` (text query), `page_size` (default 20)
- Returns JSON list of voices with id, name, description, labels, preview URL
- Caches results client-side with React Query (5 min stale time)

**2. Update `StageTTS.tsx`**
- Remove hardcoded `TTS_VOICES` array
- Add a search input field above the voice list
- Fetch voices from the edge function using React Query, debounced search
- Show voices as scrollable compact list with name + description tag (e.g. "young", "British")
- Selected voice highlighted, click to select
- Keep the text input + send button below
- Show a few default popular voices on initial load (no search term)

### UI Layout in Drawer
```
┌─ Text-to-Speech ──────────────┐
│ 🔍 Search voices...           │
│ ┌─────────────────────────┐   │
│ │ Roger  · deep male      │   │
│ │ Sarah  · warm female    │ ◄ scrollable
│ │ Alice  · clear female   │   │
│ │ ...                     │   │
│ └─────────────────────────┘   │
│ [Type message...] [Send]      │
│                        0/500  │
└───────────────────────────────┘
```

### No DB changes needed
