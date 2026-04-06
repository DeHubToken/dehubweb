

## Fix: MiniMax Music Always Generates "La La La" Lyrics

### Root Cause

In the `fal-ai-tools` edge function, the MiniMax Music tool config has this:

```typescript
buildInput: (p) => ({
  prompt: p.prompt || 'upbeat pop song',
  lyrics_prompt: p.lyrics || p.lyrics_prompt || '[verse]\nLa la la\n[chorus]\nOh oh oh',
}),
```

The client (`AssistantPage.tsx`) sends: `{ tool: 'minimax-music', prompt: "Create a song about love" }`

Since **no `lyrics` or `lyrics_prompt` field** is ever sent from the client, the lyrics always default to the hardcoded "La la la / Oh oh oh" placeholder. The user's creative prompt only goes into the `prompt` field (which MiniMax treats as a style/mood descriptor), not into `lyrics_prompt` (which controls the actual sung words).

### Fix

**1. Edge function (`supabase/functions/fal-ai-tools/index.ts`)**

Update `minimax-music.buildInput` to use the user's prompt as the lyrics source when no explicit lyrics field is provided:

```typescript
buildInput: (p) => ({
  prompt: p.prompt || 'upbeat pop song',
  lyrics_prompt: p.lyrics || p.lyrics_prompt || p.prompt || '',
}),
```

This way, when a user says "Create a song about summer vibes with a chill beat", that text flows into `lyrics_prompt` as well, giving MiniMax actual creative direction for the lyrics instead of "La la la".

**2. Optionally, send lyrics separately from the client** (enhancement)

In `AssistantPage.tsx`, when the AI detects a music request, use the Lovable AI to generate proper structured lyrics from the user's prompt before sending to fal-ai-tools. This would produce better results since MiniMax expects formatted lyrics with `[verse]`, `[chorus]` tags.

However, the minimal fix (step 1 alone) will immediately stop the "La la la" problem by passing the user's prompt as the lyrics input.

### Files Changed
- `supabase/functions/fal-ai-tools/index.ts` — 1-line change in `buildInput`
- Deploy the edge function

