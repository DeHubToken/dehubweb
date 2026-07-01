---
name: dehub-poster
description: Generate DeHub-branded posters, social images, and marketing content using the official DeHub logos and brand styles. Triggers on requests like "make me a dehub poster", "dehub content", "dehub social image", "dehub announcement graphic", or any DeHub image generation request.
---

# DeHub Poster & Content Generator

Use this skill whenever the user asks for a DeHub-branded image: posters, social cards, announcements, banners, thumbnails, etc.

## Model

Always use **`google/gemini-3.1-flash-image`** (Nano Banana 2) via the agent-side `imagegen--edit_image` tool. It's ~1¢ per image, fast, and excellent at compositing brand logos into generated scenes.

- For brand-locked output, prefer `edit_image` with the logo as input (keeps the mark crisp).
- Use `generate_image` with `model: "fast"` ONLY when no logo placement is needed (background plates, abstract textures).

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
- **Typography in image**: if any text is rendered, keep it minimal, sans-serif, thin to medium weight, white.
- **No emoji. No stock-AI clichés** (purple/indigo gradient on white, generic "hero with arms up", glossy 3D blobs).
- **Square (1024×1024) by default** for social. Use 1536×1024 for posters/banners, 1024×1536 for stories.

## Default prompt scaffold

When generating, structure the prompt like:

```
[SCENE / SUBJECT in 1–2 sentences], cinematic, dark background, premium liquid-glass aesthetic, subtle ambient glow, lots of negative space. The DeHub white wordmark logo is placed [POSITION, e.g. top-left / centered / bottom-center] at roughly [SIZE]% of canvas width, crisp, unaltered, pure white, with clear space around it. No additional text unless specified. No blue. High detail, 4k, poster quality.
```

Always pass the chosen logo file as the first input image to `edit_image` so the mark stays sharp.

## Official brand links

Only include these on a poster if the user explicitly asks for socials, website, links, contact, or QR. Otherwise omit — a clean logo-only composition is the default.

- **Website**: `dehub.io`
- **X / Twitter**: `x.com/dehub_official`
- **Telegram (main)**: `t.me/dehub_dhb`
- **Discord**: `discord.gg/dehub`
- **Regional Telegrams**: Turkish `t.me/Dehub_Turkish` · Arabic `t.me/Dehub_Arabic` · Hindi `t.me/dehub_hindi` · China `t.me/dehub_china` · Indonesia `t.me/dehub_indonesia` · Germany `t.me/dehub_dach` · Vietnam `t.me/dehub_vietnam` · Philippines `t.me/DeHub_Philippines`

Rendering rules for links on a poster: pure white, minimal thin/medium sans-serif, small size, placed along the bottom of the composition with generous letter-spacing, no colored icons. Only include the specific links the user asked for — e.g. "with socials" = X + Telegram + Discord + Website; "with website" = just `dehub.io`; "regional Telegrams" = only those. Never invent or shorten handles.


## Workflow

1. Confirm intent (poster, social card, banner?) and any specific message/theme — ask only if truly ambiguous.
2. Pick logo variant (primary by default).
3. Pick dimensions based on format.
4. Call `imagegen--edit_image` with:
   - `image_paths`: `[".agents/skills/dehub-poster/assets/dehub-logo-primary.png"]` (or alternative)
   - `prompt`: built from the scaffold above
   - `target_path`: `/mnt/documents/dehub-<slug>.png` (scratchpad — don't dump into project unless user asks)
   - `width` / `height` set to chosen dimensions
5. Show the result. Offer 1 quick variant if the user wants tweaks.

## Don'ts

- Don't use premium/expensive image models for routine DeHub content — Nano Banana 2 is the standard.
- Don't recolor the logo, add gradients to it, or place it on busy areas without clear space.
- Don't introduce blue anywhere in the composition.
- Don't save outputs into `src/assets/` unless the user explicitly wants the image shipped into the app.
