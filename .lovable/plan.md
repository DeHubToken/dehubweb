## Add All fal.ai AI Tools with DHB Payment

Now that fal.ai is integrated (FAL_KEY configured), add 5 new AI tool categories using the same DHB pay-per-use system.

### Architecture
- **Single new edge function** `fal-ai-tools` handles all 5 tool types (DRY — reuses same queue pattern)
- **Unified constants file** for all tool models with pricing
- **Generic AiToolPaywallModal** component (reusable across all tools)
- **AssistantPage integration** with keyword detection + result rendering

### New AI Tools

| Tool | fal.ai Endpoint | Base Cost | With Markup | Type |
|------|----------------|-----------|-------------|------|
| 🎵 MiniMax Music 2.0 | `fal-ai/minimax-music/text-to-music` | $0.10/song | $0.20 | Async |
| 🎵 ACE-Step | `fal-ai/ace-step/prompt-to-audio` | $0.05/song | $0.10 | Async |
| 🗣️ Dia TTS | `fal-ai/dia-tts` | $0.04/1K chars | $0.08 | Sync |
| 🖼️ Background Removal | `fal-ai/birefnet/v2` | $0.02/image | $0.04 | Sync |
| 🔍 Creative Upscaler | `fal-ai/creative-upscaler` | $0.08/image | $0.16 | Async |
| 🔍 AuraSR (Fast Upscale) | `fal-ai/aura-sr` | $0.04/image | $0.08 | Sync |
| 📝 Whisper STT | `fal-ai/whisper` | $0.03/min | $0.06 | Sync |

### Steps
1. Create `supabase/functions/fal-ai-tools/index.ts` — unified handler
2. Create `src/constants/ai-tools.constants.ts` — models + pricing
3. Create `src/components/app/ai-tools/AiToolPaywallModal.tsx` — generic paywall
4. Integrate into AssistantPage — keyword detection, paywall trigger, result display
5. Add to config.toml, deploy, test