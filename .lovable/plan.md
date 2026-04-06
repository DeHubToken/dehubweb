

## Plan: Inject TTS Audio Directly Into Agora Channel

### Problem
TTS audio currently plays through the host's local speakers only. Other participants can't hear it, and it doesn't work if the host is muted.

### Solution
Instead of playing TTS via a local `Audio` element, inject the audio directly into the Agora audio track by mixing it with the microphone stream using Web Audio API. This way all participants hear it regardless of mute state.

### How It Works

```text
TTS audio blob
      ↓
AudioContext.decodeAudioData()
      ↓
BufferSourceNode ──→ MediaStreamDestination
                            ↓
                     Mixed track published
                     to Agora channel
```

### Changes

**1. Expose Agora refs from `StageContext.tsx`**
- Add a new function `injectAudio(audioBlob: Blob): Promise<void>` to the context
- This function will:
  - Decode the audio blob into an AudioBuffer
  - Create a temporary AudioContext + MediaStreamDestination
  - Create a BufferSourceNode, connect it to the destination
  - Create a new Agora custom audio track from the destination stream
  - Unpublish the current mic track, publish the TTS track (temporarily unmuted)
  - On playback end, re-publish the original mic track with its previous mute state
- Add `injectAudio` to the `StageContextType` interface and provider value

**2. Update `StageTTS.tsx`**
- Import `useStage` to access `injectAudio`
- Replace the current local `Audio` playback with a call to `injectAudio(audioBlob)`
- Remove the `audioRef` and local Audio element logic
- Keep loading state and error handling

**3. Update `AudioSpacesModal.tsx`**
- Show TTS for both hosts AND speakers (not just hosts), since speakers also have published audio tracks

### Key Details
- During TTS playback, the mic track is temporarily replaced so TTS goes through the channel
- After TTS finishes, the original mic track is restored with its previous mute state
- No changes needed to the edge function — it already returns the audio blob correctly
- The soundboard has the same local-only problem but is out of scope for this change

