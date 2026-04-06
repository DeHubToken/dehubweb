

## Plan: ElevenLabs TTS for Stage Speakers

### What You'll Get
Hosts and speakers in a Stage can type a message, pick from 6 high-quality ElevenLabs voices, and have it spoken aloud to everyone in the room.

### Setup Required
You'll need an **ElevenLabs API key**. You can get one at [elevenlabs.io](https://elevenlabs.io) — they have a free tier with limited credits.

### Changes

**1. Add `ELEVENLABS_API_KEY` secret**
- Prompt you to enter your ElevenLabs API key

**2. Create `elevenlabs-tts` edge function** (`supabase/functions/elevenlabs-tts/index.ts`)
- Accepts `text` and `voiceId` params
- Calls ElevenLabs TTS API with `eleven_turbo_v2_5` model (low latency)
- Returns raw audio binary
- 6 voice options: Roger, Sarah, Laura, Charlie, George, Alice

**3. Create `StageTTS` component** (`src/components/app/spaces/StageTTS.tsx`)
- Text input with character limit (~500 chars)
- Voice selector dropdown (6 voices with preview labels)
- Send button that calls the edge function
- Loading state while generating
- Plays returned audio locally via `HTMLAudioElement` (Agora picks it up through the mic, or we can use local playback for all participants to hear)
- Visible to hosts and speakers only

**4. Update `AudioSpacesModal.tsx`**
- Add `StageTTS` component below the soundboard section
- Show for hosts and speakers (not listeners)

### Voice Options
| Voice | ID | Style |
|-------|----|-------|
| Roger | CwhRBWXzGAHq8TQ4Fs17 | Deep, authoritative male |
| Sarah | EXAVITQu4vr4xnSDxMaL | Warm, natural female |
| Laura | FGY2WhTYpPnrIDTdsKH5 | Soft, professional female |
| Charlie | IKne3meq5aSn9XLyUdCD | Friendly male |
| George | JBFqnCBsd6RMkjVDRZzb | British, distinguished male |
| Alice | Xb7hH8MSUJpSbSDYk0k2 | Young, clear female |

### Audio Routing
The generated speech plays through a local `Audio` element. Since the speaker's mic is active in the Stage, Agora will pick up the audio and broadcast it to all participants. This is the simplest approach that works without complex Agora track injection.

