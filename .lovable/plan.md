# Auto-enhance user prompts for DeHub posters

## Goal
When a user asks the in-app AI assistant for a DeHub poster/banner/social card with a short or vague prompt (e.g. "make a dehub poster about our airdrop"), silently rewrite it into a **senior-art-director-grade** brief before sending to GPT-image-2 — so results feel like a $100k/yr content creator made them, not a generic AI render.

## Where
Only one file changes: `supabase/functions/generate-image/index.ts` — inside the existing `brandIntent` branch that already forces DeHub brand rules. This keeps the enhancement server-side, invisible to the user, and automatic.

## How it works

1. **Detect brand intent** — already done (`/de\s*hub/` + poster/banner/etc keywords).
2. **Extract user's core subject** — the raw prompt (e.g. "airdrop announcement").
3. **Call a fast text model** (`google/gemini-2.5-flash` via `/v1/chat/completions`, ~free tier) with a locked "senior art director" system prompt that:
   - Takes the user's short brief
   - Returns a single dense visual prompt (~120–180 words)
   - Enforces: concrete subject, lighting, camera/lens feel, materials, mood, composition, focal hierarchy, negative space reservation for logo, explicit "no text unless requested", brand palette (deep black, white, muted neon glow, no blue), Exo typography if any text is warranted
   - Adds art-direction specifics the user didn't think of (grain, chromatic aberration hints, depth cues, subject scale, background falloff)
   - Never invents facts (dates, prices, names) — if the user didn't say it, it's not in the image
4. **Use the enhanced prompt** as the scene prompt sent to GPT-image-2 (existing path). Falls back to the user's original prompt if the rewrite call fails or times out (>4s).
5. **Log** the before/after at info level so we can tune the director prompt over time.

## The "Senior Art Director" system prompt (locked in code)

```
You are a senior art director rewriting a short user brief into a single
dense image-generation prompt for a premium DeHub brand poster. Output ONE
paragraph, 120–180 words, no lists, no preamble.

Rules:
- Subject first, then environment, then lighting, then materials/textures,
  then camera/lens feel, then mood, then composition + negative space.
- Reserve a specific clear region (top-left third / centered band / bottom-
  center) for a logo lockup — do NOT draw a logo or text there.
- Palette: deep black/charcoal (#000–#0a0a0a), white, subtle white-opacity
  accents, optional muted neon glow (magenta/violet/cyan). NEVER blue.
- Aesthetic: liquid glass, frosted blur, cinematic, A24-poster meets Apple-
  keynote meets cyberpunk. Premium, decentralized-tech.
- If text is warranted, specify it as Exo/Exo 2, white, wide tracking; else
  say "no additional text".
- Never invent facts (dates, prices, names, quotes) the user didn't state.
- End with: "4k, poster quality, high detail."
```

## Cost / latency
- Extra call: `gemini-2.5-flash` text, ~free.
- Adds ~600–1200ms before the image call. Acceptable for a 15–25s image generation.
- Hard 4s timeout with fallback to original prompt.

## Not changing
- The `.agents/skills/dehub-poster` skill (agent-side) — separate surface.
- GPT-image-2 as default model, Gemini fallback, logo compositing rules.
- Detection heuristic (already works).
- Any UI / frontend code.

## Open question
Should the enhancement also apply to **non-brand** image requests (i.e. any prompt), or strictly only when `brandIntent` fires? I'd default to **brand-only** to keep behavior predictable and costs nil — say the word if you want it universal.
