

## Add Persistence to All AI Generation Tools

### Current State
- **AI Tools (music, TTS, upscaler, etc.)**: Already have localStorage persistence via `savePendingTool`/`clearPendingTool` — survives reloads ✓
- **Video generation**: Uses polling (`pollVideoStatus`) but has **no persistence** — lost on reload ✗
- **Image generation**: Synchronous (no polling) — completes in a single request, so persistence isn't applicable
- **Streaming text**: Real-time SSE — also completes live, no persistence needed

### What Needs to Change
Only **video generation** needs persistence added. Image and text are synchronous/streaming and don't have an async polling gap.

### Plan

**1. Add video persistence helpers** (in `AssistantPage.tsx`)
- Create a `PENDING_VIDEO_KEY = 'dehub-pending-video'` localStorage key
- Add `savePendingVideo` and `clearPendingVideo` helper functions (same pattern as `savePendingTool`)
- Store: `predictionId`, `messageId`, `provider`, `falAppId`, `content`

**2. Save pending state when video generation starts**
- In `handleVideoGenerationConfirm`, after creating the placeholder message and starting polling, call `savePendingVideo(...)` to persist the request details
- In the music-video pipeline (Step 2), also call `savePendingVideo(...)` when video polling begins

**3. Clear pending state on completion/failure**
- In `pollVideoStatus`, call `clearPendingVideo()` when status is `succeeded` or `failed`

**4. Restore on mount**
- Extend the existing mount `useEffect` (or add a sibling) to check for `PENDING_VIDEO_KEY`
- Re-inject the `isVideoGenerating` placeholder message into state
- Resume `pollVideoStatus` interval polling

### Files Changed
- `src/pages/app/AssistantPage.tsx` — ~30 lines added following the exact same pattern as the existing AI tool persistence

