

## Upgrade AI Assistant Voice Selection with ElevenLabs Library + Custom Voice Training

### Overview
Replace the current 3-preset voice selector (Female/Male/Neutral) in the AI Assistant settings with a full ElevenLabs voice library browser (reusing the same pattern from Stages TTS), and add the ability for users to train/clone a custom voice by uploading audio samples.

### Current State
- Assistant voice uses browser Web Speech API with 3 hardcoded presets
- Stages TTS already has a searchable ElevenLabs voice picker with preview playback
- ElevenLabs API key is configured; `elevenlabs-voices` and `elevenlabs-tts` edge functions exist

### Changes

**1. Create shared ElevenLabs voice picker component**
- Extract the voice search/list/preview UI from `StageTTS.tsx` into a reusable `src/components/app/shared/ElevenLabsVoicePicker.tsx`
- Props: `selectedVoiceId`, `onSelect`, optional `showPreview` (in assistant, preview plays locally instead of injecting into Agora)
- Include search input, scrollable voice list with labels, and play/stop preview buttons
- Add a "Custom Voices" section at the top showing user-trained voices stored in a new database table

**2. Create voice cloning edge function**
- New `supabase/functions/elevenlabs-clone-voice/index.ts`
- Accepts audio file upload (FormData) + voice name
- Calls ElevenLabs `POST /v1/voices/add` API with the audio samples for Instant Voice Cloning
- Returns the new `voice_id` and `name`
- Requires authentication (wallet address)

**3. Create database table for user custom voices**
- New `custom_voices` table: `id`, `wallet_address`, `voice_id` (ElevenLabs ID), `name`, `created_at`
- RLS: users can only read/insert/delete their own voices

**4. Create voice training UI component**
- New `src/components/app/shared/VoiceTrainingDrawer.tsx`
- UI flow: user taps "+ Train Custom Voice" → drawer opens → enter voice name → record or upload audio sample (min 30s recommended) → submit → loading state → success with new voice added
- Audio recording reuses existing MediaRecorder patterns from voice assistant

**5. Update AssistantPage voice settings section**
- Replace the 3-preset buttons with the new `ElevenLabsVoicePicker`
- Add "+ Train Custom Voice" button below the picker
- Persist selected ElevenLabs voice ID to localStorage
- Keep "Always Speak Replies" toggle as-is

**6. Update TTS in assistant to use ElevenLabs**
- When user has an ElevenLabs voice selected, route `speak()` calls through `elevenlabs-tts` edge function instead of browser Web Speech API
- Keep browser Web Speech API as fallback for the "System Default" option
- Update `use-voice-chat.ts` or create a wrapper that checks the selected voice type

### Files to create
- `src/components/app/shared/ElevenLabsVoicePicker.tsx`
- `src/components/app/shared/VoiceTrainingDrawer.tsx`
- `src/hooks/use-custom-voices.ts`
- `supabase/functions/elevenlabs-clone-voice/index.ts`

### Files to modify
- `src/pages/app/AssistantPage.tsx` — replace voice preset section
- `src/hooks/use-voice-chat.ts` — add ElevenLabs TTS path
- `src/components/app/spaces/StageTTS.tsx` — use shared picker (optional refactor)

### Database migration
```sql
CREATE TABLE public.custom_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  elevenlabs_voice_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.custom_voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voices"
  ON public.custom_voices FOR SELECT
  USING (lower(wallet_address) = lower(get_request_wallet_address()));

CREATE POLICY "Users can insert own voices"
  ON public.custom_voices FOR INSERT
  WITH CHECK (lower(wallet_address) = lower(get_request_wallet_address()));

CREATE POLICY "Users can delete own voices"
  ON public.custom_voices FOR DELETE
  USING (lower(wallet_address) = lower(get_request_wallet_address()));
```

### Technical Notes
- ElevenLabs Instant Voice Cloning requires at least one audio sample; the API accepts up to 25 samples
- Voice cloning uses `POST https://api.elevenlabs.io/v1/voices/add` with multipart form data containing `name`, `files`, and optional `description`
- The shared picker will show custom voices first, then the ElevenLabs library results below
- Selected voice preference persisted in localStorage as `{ type: 'elevenlabs', voiceId: '...' }` or `{ type: 'browser', preset: 'female' }`

