# Speed up DeHub Poster skill

## Problem
The poster skill defaults to GPT-image-2 medium for step 1 (scene generation), which takes ~20–40s per render. GPT-image-2's advantage is in-image typography — but the skill composites the real logo PNG in step 2, so that advantage only matters when the poster itself has baked-in text (socials, URLs, taglines).

## Change
Update `.agents/skills/dehub-poster/SKILL.md` to a text-aware two-tier default. Nothing else changes — no code, no components, no pipeline restructure.

### New model tier table

| Tier | Model | Speed | Cost | When |
|---|---|---|---|---|
| **Default (logo-only posters)** | `imagegen--generate_image` with `model: "gemini-3.1-flash-image"` (Nano Banana 2) | ~4s | ~1¢ | The common case: logo-only compositions, no rendered text in the scene |
| **Text-in-image** | `imagegen--generate_image` with `model: "premium.gpt"` (GPT-image-2 medium) | ~30s | ~10¢ | Poster has baked-in socials strip, URLs, taglines, or any other typography that must be legible |
| **Hero / campaign** | `model: "premium"` (GPT-image-2 high) | ~40s | ~30¢ | Explicit hero / marketing top-tier art (unchanged) |
| **Rough drafts** | `imagegen--edit_image` with Nano Banana 2 | ~3s | ~1¢ | Iterations before locking a direction (unchanged) |

### Decision rule (added to the skill)
Before picking a tier, check whether the user asked for any of: socials, links, website, URL, handle, tagline, contact, QR, or literal text on the poster.
- **Yes → Text-in-image tier** (GPT-image-2 medium).
- **No → Default tier** (Nano Banana 2). This is the common case.

The step-2 logo composite stays exactly the same — it already uses Nano Banana 2 and works well.

## Expected impact
- Logo-only posters (majority of requests): **~30s → ~7s** end-to-end, ~1¢ vs ~10¢.
- Text-baked posters: unchanged behavior, same quality.
- Hero tier: unchanged.

## Files touched
- `.agents/skills/dehub-poster/SKILL.md` — update the "Model" section table, the workflow step 3, and the decision rule. Then apply the draft so it becomes active.

## Not touched
- No app code, no edge functions, no UI.
- Brand rules (palette, Exo typography, logo compositing, no-blue rule, official links) all unchanged.
