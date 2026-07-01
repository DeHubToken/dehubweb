# Upgrade DeHub Poster Skill to GPT-image-2 (medium) + Logo Overlay

## Goal
Replace Nano Banana 2 with **OpenAI GPT-image-2 at `quality: "medium"`** as the default for DeHub-branded image generation, and composite the official white wordmark onto the result in post so the logo stays perfectly crisp (no model drift on the mark).

## Why
- GPT-image-2 renders typography (Exo, taglines, socials, URLs) dramatically more accurately than Gemini — critical for brand posters.
- `quality: "medium"` (~8–12¢/image) is the sweet spot: premium look without the ~20–40¢ hit of `high`.
- Compositing the real logo PNG guarantees a pixel-perfect wordmark instead of relying on the model to redraw it.
- Nano Banana 2 stays available as a fast/cheap fallback for iteration.

## Changes

### 1. Update `.agents/skills/dehub-poster/SKILL.md`
- Change **Model** section:
  - Default: `openai/gpt-image-2` via `imagegen--generate_image` using `model: "premium.gpt"` (the agent-side premium tier that routes to GPT-image-2 medium).
  - Fallback: `google/gemini-3.1-flash-image` via `imagegen--edit_image` when the user wants a fast/cheap iteration or when GPT moderation rejects the prompt.
- Change **Workflow**:
  1. Generate the scene *without* the logo using `imagegen--generate_image` (`model: "premium.gpt"`, `transparent_background: false`), saving to `/mnt/documents/dehub-<slug>-bg.jpg`.
  2. Composite the white wordmark on top using `imagegen--edit_image` with `image_paths: [bg, logo]` and a short prompt: *"Place the DeHub white wordmark from the second image onto the first image at [position] at ~[size]% width, keep the mark pure white, crisp, unaltered, with generous clear space. Do not modify anything else."*
  3. Save final to `/mnt/documents/dehub-<slug>.png`.
- Update **Default prompt scaffold** to drop the "logo is placed..." sentence for the *scene* prompt (that's step 2's job) and instead reserve a clean area (e.g. "leave the top-left third as calm negative space for a logo lockup").
- Update **Don'ts**: remove the line about Nano Banana 2 being "the standard"; replace with "Don't burn premium credits on rough iterations — use Nano Banana 2 fallback for drafts, GPT-image-2 for the final."

### 2. Add a cost + model reference block to the skill
Small table at the top of the Model section so future agent runs pick correctly:

```
Default:   openai/gpt-image-2 (medium)   ~8–12¢   final posters, socials, banners
Fallback:  google/gemini-3.1-flash-image ~1¢      drafts, quick iterations, retries
Hero:      openai/gpt-image-2 (high)     ~20–40¢  campaign/marketing hero art (only if user asks)
```

### 3. Apply the draft
Call `skills--apply_draft` on `.agents/skills/dehub-poster` to activate.

## Not changing
- Brand style rules (deep black, no blue, liquid glass, Exo typography, negative space) — unchanged.
- Official links section and rendering rules — unchanged.
- Logo assets under `assets/` — unchanged.
- In-app assistant prompt (`AssistantPage.tsx` `buildDeHubBrandPrompt`) — will mirror the same model change in a follow-up if you want; flag it and I'll include it.

## Open question
Do you also want the in-app AI assistant (`/app/assistant`) to switch to GPT-image-2 medium for branded requests, or keep that on Nano Banana 2 for cost and change only the agent-side skill? I'll include the assistant change in this plan if you say yes.
