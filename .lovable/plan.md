

## Built-in Voice Changer for Stages

### Research Findings

**Agora Web SDK does NOT have built-in voice effects.** The `setAudioEffectPreset`, `setVoiceBeautifierPreset`, etc. are only available on Native SDKs (Android, iOS, macOS, Windows). The Web SDK lacks these APIs entirely.

**However**, we can achieve this using the **Web Audio API** approach:
1. Capture mic audio via `getUserMedia`
2. Route it through Web Audio API nodes (pitch shifter, reverb, distortion, etc.)
3. Create a `MediaStream` from the processed output
4. Feed it to Agora via `AgoraRTC.createCustomAudioTrack({ mediaStreamTrack })` instead of `createMicrophoneAudioTrack()`

This is proven — there's a well-documented pattern using Pizzicato.js or raw Web Audio API with Agora.

### Voice Effect Options

| Effect | How | Web Audio Nodes |
|--------|-----|-----------------|
| Deep Voice | Pitch down | PitchShifter (via `AudioWorklet` or playback rate trick) |
| Chipmunk | Pitch up | Same, opposite direction |
| Robot | Ring modulator | Oscillator + GainNode |
| Echo/Cave | Delay + reverb | DelayNode + ConvolverNode |
| Radio | Bandpass filter + distortion | BiquadFilterNode + WaveShaperNode |
| Megaphone | High-pass + distortion | BiquadFilterNode + WaveShaperNode |

### Plan

**1. Create `useVoiceEffects` hook** (`src/hooks/use-voice-effects.ts`)
- Takes a raw `MediaStream` as input
- Returns a processed `MediaStreamTrack` ready for Agora
- Supports switching effects in real-time via an `AudioContext` graph
- Effects: None, Deep, Chipmunk, Robot, Echo, Radio
- Uses native Web Audio API nodes (no external library needed for most effects)
- For pitch shifting: use a simple `AudioWorklet` or the detune trick with `OscillatorNode`

**2. Create voice effect types/constants** (`src/constants/voice-effects.constants.ts`)
- Define effect presets with IDs, names, emojis, and audio parameter configs

**3. Create `VoiceEffectSelector` UI component** (`src/components/app/stages/VoiceEffectSelector.tsx`)
- Horizontal pill selector shown in the stage drawer when user is host/speaker
- Liquid glass styling matching existing stage controls
- Shows current effect with emoji indicator

**4. Update `StageContext.tsx`**
- Add `voiceEffect` state and `setVoiceEffect` action to context
- In `initializeAgora` and `upgradeSpeaker`: instead of `createMicrophoneAudioTrack()`, get raw mic stream → process through `useVoiceEffects` → create custom audio track
- When effect changes mid-session: rebuild the audio graph and republish the track

**5. Integrate selector into stage drawer UI**
- Add `VoiceEffectSelector` below the mute/leave controls in the live stage view
- Only visible to hosts and speakers (not listeners)

### Technical Details

The core audio processing chain:
```text
Mic (getUserMedia) → AudioContext.createMediaStreamSource()
  → [Effect Nodes: BiquadFilter / Delay / WaveShaper / etc.]
  → MediaStreamDestination
  → AgoraRTC.createCustomAudioTrack({ mediaStreamTrack })
```

Key consideration: When switching effects, we swap out the intermediate nodes in the audio graph without recreating the entire Agora track — just disconnect old nodes, connect new ones. This avoids audio drops.

### Files Changed
- **New**: `src/constants/voice-effects.constants.ts` — effect presets
- **New**: `src/hooks/use-voice-effects.ts` — Web Audio API processing hook
- **New**: `src/components/app/stages/VoiceEffectSelector.tsx` — UI selector
- **Modified**: `src/contexts/StageContext.tsx` — integrate voice effects into Agora pipeline
- **Modified**: Stage drawer component — add selector to live view

