---
name: dehub-poster
description: Generate DeHub-branded posters, social images, and marketing content using the official DeHub logos and brand styles. Triggers on requests like "make me a dehub poster", "dehub content", "dehub social image", "dehub announcement graphic", or any DeHub image generation request.
---

# DeHub Poster & Content Generator

Use this skill whenever the user asks for a DeHub-branded image: posters, social cards, announcements, banners, thumbnails, etc.

## Model

Two-step flow: generate the scene, then composite the real logo PNG on top so the wordmark stays pixel-perfect. Pick the scene model by whether the poster has **baked-in typography** (socials, URLs, taglines, headings drawn into the image itself).

| Tier | Model | Speed | Approx cost | When |
|---|---|---|---|---|
| **Default — logo-only** | `imagegen--generate_image` with `model: "gemini-3.1-flash-image"` (Nano Banana 2) | ~4s | ~1¢ | The common case: logo-only compositions, no rendered text in the scene |
| **Text-in-image** | `imagegen--generate_image` with `model: "premium.gpt"` (GPT-image-2 medium) | ~30s | ~8–12¢ | Poster has baked-in socials strip, URLs, handles, taglines, headings — anything that must be legibly typeset |
| **Hero / campaign** | `imagegen--generate_image` with `model: "premium"` (GPT-image-2 high) | ~40s | ~20–40¢ | Only when the user explicitly asks for hero / campaign / marketing top-tier art |
| **Rough drafts** | `imagegen--edit_image` with `model` unset (Nano Banana 2) | ~3s | ~1¢ | Cheap iterations before locking a direction, or GPT moderation-rejection retries |

### Decision rule
Before picking a tier, check whether the user asked for any of: socials, links, website, URL, handle, tagline, contact, QR, headline, or literal text on the poster.
- **No → Default tier** (Nano Banana 2). Fast and cheap; quality matches Gemini Pro on non-text scenes.
- **Yes → Text-in-image tier** (GPT-image-2 medium). Gemini renders in-image typography less reliably; use GPT for anything the viewer must read.

The logo is composited in step 2 using the real PNG, so the wordmark never drifts regardless of scene model.



## Brand assets

Logos live in this skill's `assets/` folder:

- `assets/dehub-logo-primary.png` — primary wordmark (use by default)
- `assets/dehub-logo-alternative.png` — alternative wordmark (use for variety / dense compositions)

Both are **white-on-transparent**. They must always appear in white (or near-white). Never recolor, gradient-fill, drop-shadow heavily, or distort.

## Brand style rules

These mirror the DeHub app design system — apply to every generated image:

- **Palette**: deep black / charcoal backgrounds (`#000`–`#0a0a0a`), white text, subtle white-opacity accents. **Never use blue.** Occasional muted neon (magenta, violet, cyan glow) is OK only as ambient lighting, never as logo color.
- **Aesthetic**: liquid glass, frosted blur, cinematic, premium, decentralized-tech feel. Think Apple keynote × cyberpunk × A24 poster.
- **Composition**: lots of negative space, strong focal hierarchy, logo placed with breathing room (min 8% of canvas as clear space around it).
- **Typography in image**: use the **Exo / Exo 2** typeface family (geometric, slightly technical sans-serif) for ALL rendered text — headings, taglines, links, handles. Weights: Light (300) or Regular (400) for body/links, Medium (500) or SemiBold (600) for headings, Bold (700) only for short high-impact display words. Always white. Generous letter-spacing (tracking) on caps and links. No serifs, no script, no rounded/humanist sans (Inter, Poppins, DM Sans etc.). If Exo is unavailable to the model, fall back to a near-equivalent geometric technical sans (Eurostile, Michroma, Rajdhani) — never a generic default.
- **No emoji. No stock-AI clichés** (purple/indigo gradient on white, generic "hero with arms up", glossy 3D blobs).
- **Square (1024×1024) by default** for social. Use 1536×1024 for posters/banners, 1024×1536 for stories.

## Default prompt scaffold

When generating, structure the prompt like:

```
[SCENE / SUBJECT in 1–2 sentences], cinematic, dark background, premium liquid-glass aesthetic, subtle ambient glow, lots of negative space. Leave [POSITION, e.g. the top-left third / a centered horizontal band / the bottom-center] as calm empty space reserved for a logo lockup — do not draw a logo, do not draw text there. No additional text unless specified. No blue. High detail, 4k, poster quality.
```

The logo is NOT drawn by the scene model — it's composited in step 2 of the workflow using the real PNG.


## Official brand links

Only include these on a poster if the user explicitly asks for socials, website, links, contact, or QR. Otherwise omit — a clean logo-only composition is the default.

- **Website**: `dehub.io`
- **X / Twitter**: `x.com/dehub_official`
- **Telegram (main)**: `t.me/dehub_dhb`
- **Discord**: `discord.gg/dehub`
- **Regional Telegrams**: Turkish `t.me/Dehub_Turkish` · Arabic `t.me/Dehub_Arabic` · Hindi `t.me/dehub_hindi` · China `t.me/dehub_china` · Indonesia `t.me/dehub_indonesia` · Germany `t.me/dehub_dach` · Vietnam `t.me/dehub_vietnam` · Philippines `t.me/DeHub_Philippines`

Rendering rules for links on a poster: pure white, **Exo / Exo 2** (Light or Regular weight), small size, placed along the bottom of the composition with generous letter-spacing, no colored icons. Only include the specific links the user asked for — e.g. "with socials" = X + Telegram + Discord + Website; "with website" = just `dehub.io`; "regional Telegrams" = only those. Never invent or shorten handles.


## Workflow

1. Confirm intent (poster, social card, banner?) and any specific message/theme — ask only if truly ambiguous.
2. Pick logo variant (primary by default) and dimensions (1024×1024 square default; 1536×1024 poster/banner; 1024×1536 story).
3. **Step 1 — Generate scene** with `imagegen--generate_image`:
   - `model`: `"premium.gpt"` (GPT-image-2 medium)
   - `prompt`: built from the scaffold above, reserving clear negative space for the logo
   - `target_path`: `/mnt/documents/dehub-<slug>-bg.jpg`
   - `width` / `height`: chosen dimensions
4. **Step 2 — Composite the logo** with `imagegen--edit_image`:
   - `image_paths`: `["/mnt/documents/dehub-<slug>-bg.jpg", ".agents/skills/dehub-poster/assets/dehub-logo-primary.png"]` (or the alternative wordmark)
   - `prompt`: `"Place the DeHub white wordmark from the second image onto the first image in the [POSITION] area at roughly [SIZE]% of canvas width. Keep the mark pure white, crisp, unaltered, perfectly aligned, with generous clear space around it. Do not modify, recolor, or redraw anything else in the scene."`
   - `target_path`: `/mnt/documents/dehub-<slug>.png`
5. Show the final image. Offer 1 quick variant if the user wants tweaks — use the Nano Banana 2 fallback for cheap iterations, then re-run GPT for the final.

## Don'ts

- Don't burn premium credits on rough iterations — use the Nano Banana 2 fallback for drafts, GPT-image-2 for the final.
- Don't let the scene model render the logo — always composite the real PNG in step 2.
- Don't recolor the logo, add gradients to it, or place it on busy areas without clear space.
- Don't introduce blue anywhere in the composition.
- Don't save outputs into `src/assets/` unless the user explicitly wants the image shipped into the app.

