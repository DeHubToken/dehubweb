---
name: dehub-poster
description: Generate DeHub-branded posters, social images, and marketing content using the official DeHub logos and brand styles. Triggers on requests like "make me a dehub poster", "dehub content", "dehub social image", "dehub announcement graphic", or any DeHub image generation request.
---

# DeHub Poster & Content Generator

Use this skill whenever the user asks for a DeHub-branded image: posters, social cards, announcements, banners, thumbnails, etc.

## Model

Two-step flow: generate the scene, then composite the real logo PNG on top so the wordmark stays pixel-perfect.

**Always use Nano Banana 2** (`google/gemini-3.1-flash-image`) for both steps unless the user explicitly asks for a different model. It's fast (~4s), cheap (~1¢), and — with the tight prompt scaffold in this skill — produces the right monochrome-metallic-glass look. The old habit of defaulting to GPT-image-2 is retired: it's slower, more expensive, and doesn't obey the brand palette any better than Nano Banana 2 when the prompt is tight.

- **Step 1 (scene)** → `imagegen--generate_image` with `model: "gemini-3.1-flash-image"`.
- **Step 2 (logo composite)** → `imagegen--edit_image` with `model` unset (routes to Nano Banana 2 automatically).

Only override the model if the user literally names another one, or if a generation fails moderation and needs a retry on a different model.

## Brand DNA — the "vibe" every scene must express

DeHub is a **decentralized creator ecosystem** — social, media, staking, tipping, live streaming, AI tools, marketplaces, all on-chain. Mission: give creators sovereignty (own their audience, own their content, own their revenue) with an interface that feels as premium as any centralized app. Think "the Apple of Web3."

When the user is NOT specific about what the poster should depict, invent a scene from this vocabulary — never fall back to a generic monolith or empty room. Pick one:

- **Architectural** — floating obsidian pavilion, chrome monolith, cantilevered brushed-steel platform, mirrored glass amphitheatre, weightless silver ring suspended in mist
- **Product-hero** — a smoked-glass hardware wallet on a plinth, a mercury sphere hovering over a chrome disc, a stack of translucent smoked-crystal cards, a single silver key floating in fog
- **Landscape** — endless mirror-black lake with faint silver mist, moonlit obsidian dunes, a monochrome mountain range in cold moonlight, a chrome desert horizon
- **Abstract** — liquid mercury frozen mid-splash, a smoked-glass helix, a ribbon of brushed steel curling through space, geometric silver shards suspended weightlessly
- **Human presence (rare, silhouette only)** — a lone silhouetted figure in a chrome corridor, a hooded silhouette facing a floating silver monolith. Never a face, never a full character.

Combine one subject with a specific material and a specific atmosphere ("mercury sphere on brushed-steel plinth in charcoal mist with cold rim light"). The result should feel like a still from a $50M sci-fi film or an Apple keynote hero shot — not a stock AI render.






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
   - `model`: apply the Decision rule above. When in doubt, `"premium.gpt"` (GPT-image-2 medium) is the correct default for a real poster the user will actually use.
   - `prompt`: built from the scaffold above — dense, specific materials, specific background texture, explicit color bans. Vague prompts = flat black + stray colors = fail.
   - `target_path`: `/mnt/documents/dehub-<slug>-bg.jpg`
   - `width` / `height`: chosen dimensions
4. **Step 2 — Composite the logo** with `imagegen--edit_image`:
   - `image_paths`: `["/mnt/documents/dehub-<slug>-bg.jpg", ".agents/skills/dehub-poster/assets/dehub-logo-primary.png"]` (or the alternative wordmark)
   - `prompt`: `"Place the DeHub white wordmark from the second image onto the first image in the [POSITION] area at roughly [SIZE]% of canvas width. Keep the mark pure white, crisp, unaltered, perfectly aligned, with generous clear space around it. Do not modify, recolor, or redraw anything else in the scene."`
   - `target_path`: `/mnt/documents/dehub-<slug>.png`
5. **Self-check before showing the user.** View the final image and confirm: (a) background has real texture/depth, not flat black; (b) zero color hues — only blacks, greys, silvers, whites; (c) logo is crisp, white, well-spaced; (d) composition feels premium, not generic. If any of these fail, re-generate with a tighter prompt before showing the user. Never ship an image you know is off-brand.
6. Show the final image. Offer 1 quick variant if the user wants tweaks — use the Nano Banana 2 edit fallback for cheap iterations.

## Don'ts

- **Don't ever produce a flat pure-black background.** Backgrounds must have texture, gradient, atmospheric depth, or a real material (marble, brushed steel, misted glass). Flat #000 is the #1 failure mode.
- **Don't use any color hues.** No red, orange, yellow, magenta, purple, violet, green, blue, teal. Monochrome only — blacks, greys, silvers, chromes, whites. If a swatch has a nameable hue, regenerate.
- Don't default to Nano Banana 2 for a poster the user will actually publish — its cheap speed comes at the cost of drifting into flat backgrounds and warm color contamination. Use GPT-image-2 medium as the safe default for real posters; reserve Nano Banana 2 for drafts or when speed was explicitly requested.
- Don't burn hero-tier credits on rough iterations — use the Nano Banana 2 edit fallback for drafts.
- Don't let the scene model render the logo — always composite the real PNG in step 2.
- Don't recolor the logo, add gradients to it, or place it on busy areas without clear space.
- Don't skip the self-check step. Shipping an ugly image because "the tool returned it" is not acceptable.
- Don't save outputs into `src/assets/` unless the user explicitly wants the image shipped into the app.



