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
- **Words like "quality", "premium", "hero", "campaign", "final", "publish", "post it", "for socials" → Hero tier** (GPT-image-2 high). Never cheap out on something the user is about to publish.
- **User asks for socials, links, website, URL, handle, tagline, headline, or literal text on the poster → Text-in-image tier** (GPT-image-2 medium). Gemini renders typography unreliably.
- **User asks for a quick / draft / iteration / "just try something" → Default tier** (Nano Banana 2).
- **Everything else (a normal DeHub poster request) → Text-in-image tier by default** (GPT-image-2 medium). It's the safe middle: strong material rendering, restrained color obedience, ~30s. Nano Banana 2 is faster but drifts into flat black backgrounds and stray warm tints without extremely tight prompting — reserve it for drafts or when the user asked for speed.

The logo is composited in step 2 using the real PNG, so the wordmark never drifts regardless of scene model.




## Brand assets

Logos live in this skill's `assets/` folder:

- `assets/dehub-logo-primary.png` — primary wordmark (use by default)
- `assets/dehub-logo-alternative.png` — alternative wordmark (use for variety / dense compositions)

Both are **white-on-transparent**. They must always appear in white (or near-white). Never recolor, gradient-fill, drop-shadow heavily, or distort.

## Brand style rules

These mirror the DeHub app design system — apply to every generated image. **Strict monochrome + metallic glass.** Anything else is off-brand.

- **Palette — strict monochrome**: deep charcoal → black backgrounds (`#000`–`#0f0f10`), silvers, chromes, brushed-steel greys, cool off-whites, pure white highlights. **NO color hues at all** — no red, no orange, no yellow, no magenta, no purple, no violet, no green, no blue, no teal. Any tinted ambient light must be a **cool near-white** (barely-there cyan-white or silver-white glow, saturation under ~10%). If a swatch would read as a color name, it's wrong.
- **Materials & texture**: liquid glass, frosted glass, polished chrome, brushed aluminum, obsidian, wet volcanic stone, mercury, holographic silver foil, oil-slick greyscale, smoked crystal. Every surface should have depth — reflections, refractions, subsurface scattering, subtle caustics. **Never a flat black background.** The background must have gradient falloff, atmospheric depth (soft grey mist / volumetric light), or a textured material (brushed metal, glass ripples, black marble). Flat #000 = fail.
- **Lighting**: cinematic key light from one direction (usually upper-left or upper-right), soft rim light on subject edges, deep shadow falloff into the negative-space region. Think product photography for a $10k watch or an Apple keynote hero shot.
- **Aesthetic reference**: Apple keynote × A24 poster × Zaha Hadid × Blade Runner 2049 interiors. Premium, restrained, expensive, decentralized-tech. Never "cyberpunk neon city" — that pulls in colored lights.
- **Composition**: strong focal hierarchy, generous negative space, logo placed with breathing room (min 8% of canvas as clear space around it). Rule of thirds or centered symmetry — never busy edge-to-edge chaos.
- **Typography in image**: **Exo / Exo 2** (geometric technical sans) for ALL rendered text. Weights: Light/Regular for body, Medium/SemiBold for headings, Bold only for short display words. Always white or silver. Wide letter-spacing on caps and links. No serifs, no script, no rounded/humanist sans. Fallbacks if Exo unavailable: Eurostile, Michroma, Rajdhani — never a generic default.
- **Hard bans**: no emoji, no purple/indigo gradients, no rainbow anything, no glossy 3D blobs, no "hero with arms up", no stock-AI cliché lens flares, no red/orange energy trails, no warm sunset tones, no fire, no lava.
- **Dimensions**: 1024×1024 square default; 1536×1024 posters/banners; 1024×1536 stories.

## Default prompt scaffold

When generating, structure the prompt like this — be **dense and specific**. Vague prompts are why outputs go generic. Aim for 80–140 words.

```
[SPECIFIC SUBJECT with material description, e.g. "a floating obsidian monolith with liquid-mercury surface" or "a hovering brushed-chrome geometric shard"] rendered in strict monochrome — blacks, charcoals, silvers, chromes, cool off-whites only. Cinematic key light from [DIRECTION] with soft rim light and deep shadow falloff. Background: [SPECIFIC textured backdrop, e.g. "black marble with subtle grey veining", "volumetric charcoal mist with faint silver-white light shafts", "brushed dark steel with faint horizontal grain"] — NEVER flat black. Materials: liquid glass, frosted crystal, polished chrome, subtle caustics, subsurface scattering. Premium product-photography feel — Apple keynote meets A24 poster. Reserve [POSITION, e.g. "the upper-left third" or "a centered horizontal band"] as calm empty space for a logo lockup — do NOT draw a logo or text there. Absolutely NO color hues: no red, orange, yellow, magenta, purple, green, blue, teal. Any glow must be cool near-white (saturation under 10%). No lens flares, no rainbow, no neon. Shot on Hasselblad, 85mm, f/2.8, ultra-sharp, 4k, gallery quality.
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
   - `model`: apply the Decision rule above — `"gemini-3.1-flash-image"` for logo-only (default), `"premium.gpt"` when the poster has baked-in text, `"premium"` only if the user explicitly asked for hero/campaign tier
   - `prompt`: built from the scaffold above, reserving clear negative space for the logo
   - `target_path`: `/mnt/documents/dehub-<slug>-bg.jpg`
   - `width` / `height`: chosen dimensions
4. **Step 2 — Composite the logo** with `imagegen--edit_image`:
   - `image_paths`: `["/mnt/documents/dehub-<slug>-bg.jpg", ".agents/skills/dehub-poster/assets/dehub-logo-primary.png"]` (or the alternative wordmark)
   - `prompt`: `"Place the DeHub white wordmark from the second image onto the first image in the [POSITION] area at roughly [SIZE]% of canvas width. Keep the mark pure white, crisp, unaltered, perfectly aligned, with generous clear space around it. Do not modify, recolor, or redraw anything else in the scene."`
   - `target_path`: `/mnt/documents/dehub-<slug>.png`
5. Show the final image. Offer 1 quick variant if the user wants tweaks — use the Nano Banana 2 edit fallback for cheap iterations.

## Don'ts

- Don't reach for GPT-image-2 by default — Nano Banana 2 is ~8× faster and ~10× cheaper, and matches quality on logo-only scenes. Use GPT only when the poster has baked-in text or the user asked for hero tier.
- Don't burn premium credits on rough iterations — use the Nano Banana 2 edit fallback for drafts.
- Don't let the scene model render the logo — always composite the real PNG in step 2.
- Don't recolor the logo, add gradients to it, or place it on busy areas without clear space.
- Don't introduce blue anywhere in the composition.
- Don't save outputs into `src/assets/` unless the user explicitly wants the image shipped into the app.


