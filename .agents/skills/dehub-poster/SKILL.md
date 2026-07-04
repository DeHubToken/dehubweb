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

### Theme translation — monochrome is non-negotiable

Whatever theme the user names (Christmas, summer, airdrop, Halloween, Valentine's, Diwali, hackathon, birthday, launch, milestone, anything else), the visual must still be **strict monochrome metallic-glass**. Translate the theme into DeHub's material vocabulary — never into the theme's stereotypical color palette.

Examples of correct translation:
- **Christmas** → silver frost on obsidian, chrome ornaments on brushed-steel branches, monochrome snow drifting past a smoked-glass monolith. Never red/green/gold.
- **Summer** → chrome sun disc over a mirror-black lake, silver heat shimmer over obsidian dunes. Never orange/yellow/beach-blue.
- **Halloween** → matte black skull carved from obsidian on a silver plinth in cold mist. Never orange/purple.
- **Airdrop / launch** → silver capsules descending through charcoal fog, a chrome sphere splitting open to reveal mercury light. Never confetti/rainbow.
- **Valentine's** → two mirrored chrome hearts fused, or a single obsidian heart on brushed steel. Never red/pink.
- **Anniversary / milestone number** → the number sculpted in polished chrome or smoked glass on a monolithic plinth. Never gold.

Rule of thumb: if the theme suggests a color, **replace that color with its metallic-monochrome equivalent** (gold → chrome, red → polished obsidian with silver rim, green → brushed dark steel with cool white glow, warm light → cool near-white light). If in doubt, ask yourself: "would this look at home in an Apple keynote?" If no, tighten the prompt.








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
- **Typography in image** (only when text is explicitly requested): **Exo / Exo 2** (geometric technical sans, sharp uppercase, wide letter-spacing). Prompt language that reliably steers Nano Banana 2 toward Exo: `"typeset in Exo 2, geometric technical sans-serif, thin uniform strokes, sharp corners, wide letter-spacing"`. Always white or silver. Keep text minimal (1–5 words max) — Gemini's text rendering is fragile, and less text = higher chance it renders correctly. If the text still looks generic, regenerate rather than shipping it in the wrong typeface. No serifs, no script, no rounded/humanist sans. Fallbacks: Eurostile, Michroma, Rajdhani, Orbitron — never a generic default.
- **Hard bans**: no emoji, no purple/indigo gradients, no rainbow anything, no glossy 3D blobs, no "hero with arms up", no stock-AI cliché lens flares, no red/orange energy trails, no warm sunset tones, no fire, no lava.
- **Dimensions**: 1024×1024 square default; 1536×1024 posters/banners; 1024×1536 stories.

## Logo integration — the wordmark is PART of the scene, not stuck on top

The logo must feel like a real object *in* the scene, not a sticker slapped on afterward. To achieve this, the scene must be generated with a **physical logo surface** built into the composition — a specific object designed to hold the wordmark, matched to the scene's lighting, perspective, and material. Step 2 then places the real logo PNG onto that surface so it inherits the scene.

**Pick a logo surface for every scene** (drawn from the Brand DNA scene). Examples:

- Wordmark **engraved into obsidian** — a polished obsidian slab in the scene, with a subtle recessed etched panel where the wordmark will sit
- Wordmark **milled into brushed steel** — a brushed-aluminum plaque angled with the scene's key light
- Wordmark **backlit through smoked glass** — a translucent glass panel with a soft internal glow
- Wordmark **projected as light onto mist** — a volumetric holographic slab of cool-white light hanging in charcoal fog
- Wordmark **etched into a chrome monolith face** — a mirror-chrome vertical face oriented toward camera
- Wordmark **cast as shadow on marble** — a soft cast shadow on a slab of black marble, wordmark reads as absence of light
- Wordmark **embossed on mercury** — a raised relief on a mercury pool's surface, catching the rim light
- Wordmark **frosted into glass** — a frosted-glass panel where the mark reads as clear-through-frost

The step-1 scene prompt must explicitly describe this surface — its material, its position, its orientation, its lighting, and the fact that its face is **currently blank** (so step 2 can place the real logo there without conflict).

## Default prompt scaffold

Structure the prompt like this — **dense and specific, 100–160 words**. Every prompt must include: subject, materials, lighting, background texture, and an explicit **logo surface** built into the scene.

```
[SPECIFIC SUBJECT with material description — e.g. "a monolithic obsidian pavilion floating over a mirror-black lake"] rendered in strict monochrome — blacks, charcoals, silvers, chromes, cool off-whites only. Cinematic key light from [DIRECTION] with soft rim light and deep shadow falloff. Background: [SPECIFIC textured backdrop — e.g. "volumetric charcoal mist with faint silver-white light shafts", "black marble with subtle grey veining"] — NEVER flat black.

Built into the composition at [POSITION — e.g. "the centered vertical face of the pavilion"], a [LOGO SURFACE — e.g. "polished obsidian slab with a subtly recessed rectangular panel", "brushed-aluminum plaque catching the key light", "backlit smoked-glass panel with soft internal glow"] sized for a wordmark lockup roughly [SIZE — e.g. "40% of the scene width"]. This panel's face is currently BLANK — do NOT draw a logo, letters, or text on it. Match the panel's perspective, lighting, and material to the scene so it feels physically present.

Materials throughout: liquid glass, frosted crystal, polished chrome, subtle caustics, subsurface scattering. Premium product-photography feel — Apple keynote meets A24 poster. Absolutely NO color hues: no red, orange, yellow, magenta, purple, green, blue, teal. Any glow must be cool near-white (saturation under 10%). No lens flares, no rainbow, no neon. Shot on Hasselblad, 85mm, f/2.8, ultra-sharp, 4k, gallery quality.
```

The logo is NOT drawn by the scene model — it's composited in step 2 onto the blank surface the scene reserved for it.







## Official brand links

Only include these on a poster if the user explicitly asks for socials, website, links, contact, or QR. Otherwise omit — a clean logo-only composition is the default.

- **Website**: `dehub.io`
- **X / Twitter**: `x.com/dehub_official`
- **Telegram (main)**: `t.me/dehub_dhb`
- **Discord**: `discord.gg/dehub`
- **Regional Telegrams**: Turkish `t.me/Dehub_Turkish` · Arabic `t.me/Dehub_Arabic` · Hindi `t.me/dehub_hindi` · China `t.me/dehub_china` · Indonesia `t.me/dehub_indonesia` · Germany `t.me/dehub_dach` · Vietnam `t.me/dehub_vietnam` · Philippines `t.me/DeHub_Philippines`

Rendering rules for links on a poster: pure white, **Exo / Exo 2** (Light or Regular weight), small size, placed along the bottom of the composition with generous letter-spacing, no colored icons. Only include the specific links the user asked for — e.g. "with socials" = X + Telegram + Discord + Website; "with website" = just `dehub.io`; "regional Telegrams" = only those. Never invent or shorten handles.


## Workflow

1. Confirm intent (poster, social card, banner?) and any specific message/theme — ask only if truly ambiguous. If the user gave no scene direction, **invent one from the Brand DNA section** — never default to a plain monolith or empty room.
2. Pick logo variant (primary by default), dimensions (1024×1024 square default; 1536×1024 poster/banner; 1024×1536 story), and — critical — a **logo surface** from the Logo Integration section that fits the scene.
3. **Step 1 — Generate scene** with `imagegen--generate_image`:
   - `model`: `"gemini-3.1-flash-image"` (Nano Banana 2). Do not switch unless the user explicitly named a different model.
   - `prompt`: built from the scaffold above — subject + materials + lighting + textured background + **explicit blank logo surface** built into the scene (material, position, orientation, lighting). The blank surface is what makes the logo look integrated, not stuck on.
   - `target_path`: `/mnt/documents/dehub-<slug>-bg.jpg`
   - `width` / `height`: chosen dimensions
4. **Step 2 — Composite the logo into the scene surface** with `imagegen--edit_image`:
   - `image_paths`: `["/mnt/documents/dehub-<slug>-bg.jpg", ".agents/skills/dehub-poster/assets/dehub-logo-primary.png"]` (or the alternative wordmark)
   - `prompt`: `"The first image contains a [SURFACE — e.g. 'polished obsidian slab', 'brushed-aluminum plaque', 'backlit smoked-glass panel'] at [POSITION]. Integrate the DeHub white wordmark from the second image onto that surface as if it is [physically part of it — e.g. 'engraved into the obsidian with subtle recessed depth', 'milled into the brushed aluminum', 'backlit through the frosted glass with soft internal glow', 'projected as cool-white light onto the mist']. Match the scene's perspective, key-light direction, and shadow falloff so the wordmark inherits the scene's lighting. Keep the mark pure white / cool near-white, preserve its exact letterforms and proportions — do NOT redraw or restyle the typography. Do not add any other letters, text, or logos. Do not alter anything else in the scene."`
   - `target_path`: `/mnt/documents/dehub-<slug>.png`
5. **Self-check before showing the user.** View the final image and confirm: (a) background has real texture/depth, not flat black; (b) zero color hues — only blacks, greys, silvers, whites; (c) logo reads as **part of the scene** (matching perspective, inheriting scene lighting), not a sticker floating on top; (d) any typography is Exo-like (geometric, sharp, wide tracking) — regenerate if it looks like generic sans-serif; (e) composition feels premium and cinematic. If any fail, regenerate with a tighter prompt.
6. Show the final image. Offer 1 quick variant if the user wants tweaks.

## Don'ts

- **Don't ever produce a flat pure-black background.** Backgrounds must have texture, gradient, atmospheric depth, or a real material (marble, brushed steel, misted glass, obsidian, mercury). Flat #000 is the #1 failure mode.
- **Don't use any color hues.** No red, orange, yellow, magenta, purple, violet, green, blue, teal. Monochrome only — blacks, greys, silvers, chromes, whites. If a swatch has a nameable hue, regenerate.
- **Don't let the logo look stuck-on.** If the scene didn't include a physical surface built for the wordmark, regenerate the scene — don't try to composite onto empty space.
- **Don't submit a lazy scene.** "Abstract dark background" or "empty room" is not a scene. Every generation must have a concrete subject drawn from the Brand DNA vocabulary.
- **Don't ship generic-sans typography.** If rendered text on the poster looks like default Arial/Inter/Helvetica, regenerate with a tighter Exo prompt or reduce the text to 1–3 words.
- Don't switch models away from Nano Banana 2 unless the user literally named a different one.
- Don't let the scene model render the logo — always composite the real PNG in step 2.
- Don't recolor the logo (beyond inheriting cool scene lighting), add gradients to it, or place it on busy areas without clear space.
- Don't skip the self-check step. Shipping an ugly image because "the tool returned it" is not acceptable.
- Don't save outputs into `src/assets/` unless the user explicitly wants the image shipped into the app.





