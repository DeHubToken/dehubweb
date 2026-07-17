---
name: dehub-poster
description: Generate DeHub-branded posters, social images, and marketing content using the official DeHub logos and brand styles. Triggers on requests like "make me a dehub poster", "dehub content", "dehub social image", "dehub announcement graphic", or any DeHub image generation request.
---

# DeHub Poster & Content Generator

Use this skill whenever the user asks for a DeHub-branded image: posters, social cards, announcements, banners, thumbnails, etc.

## Model

Two-step flow: generate a scene with a real physical logo-host surface, then integrate the real logo PNG into that surface so the wordmark stays pixel-perfect. This is **not** a sticker overlay workflow.

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

### Theme translation — monochrome by default, color only on explicit request

Whatever theme the user names (Christmas, summer, airdrop, Halloween, Valentine's, Diwali, hackathon, birthday, launch, milestone, anything else), the visual must still be **strict monochrome metallic-glass unless the user explicitly asks for color**. Translate the theme into DeHub's material vocabulary — never into the theme's stereotypical color palette by default.

Examples of correct translation:
- **Christmas** → silver frost on obsidian, chrome ornaments on brushed-steel branches, monochrome snow drifting past a smoked-glass monolith. Never red/green/gold.
- **Summer** → chrome sun disc over a mirror-black lake, silver heat shimmer over obsidian dunes. Never orange/yellow/beach-blue.
- **Halloween** → matte black skull carved from obsidian on a silver plinth in cold mist. Never orange/purple.
- **Airdrop / launch** → silver capsules descending through charcoal fog, a chrome sphere splitting open to reveal mercury light. Never confetti/rainbow.
- **Valentine's** → two mirrored chrome hearts fused, or a single obsidian heart on brushed steel. Never red/pink.
- **Anniversary / milestone number** → the number sculpted in polished chrome or smoked glass on a monolithic plinth. Never gold.

Rule of thumb: if the theme suggests a color, **replace that color with its metallic-monochrome equivalent** (gold → chrome, red → polished obsidian with silver rim, green → brushed dark steel with cool white glow, warm light → cool near-white light). If the user explicitly requests a color or colored accent, allow only that requested color as a restrained accent while keeping the DeHub logo white/near-white and the scene mostly black, silver, chrome, and glass. If in doubt, ask yourself: "would this look at home in an Apple keynote?" If no, tighten the prompt.

## Design-system anchors — use when the user is vague

DeHub ships an official design system (see `assets/reference/template-signup.png` and `assets/reference/template-affiliates.png` in this skill folder — study them before generating anything ambiguous). When the user's prompt is loose ("make a dehub poster", "announcement graphic", "some content for X"), do not invent a random monolith — pull the scene's **background, texture, and typographic furniture** directly from the design system so the output looks like it came out of the DeHub brand kit.

**Core design-system motifs to inherit (in this priority order):**

1. **Machined graphite canvas.** Near-black canvas `#0a0b0d` sitting on a deeper vignette `#060708` — always a radial vignette (`radial-gradient(120% 90% at 50% -10%, #15181e, #0a0b0d 55%, #060708)`), never flat black. This is the base of every DeHub surface.
2. **Blueprint dot grid.** A faint white dot pattern (`rgba(255,255,255,0.05)` dots at ~28px spacing) laid over the vignette — the "digital blueprint" motif. Use as the background pattern whenever the scene doesn't already have a strong physical texture. Prompt language: `"faint blueprint dot-grid pattern at ~28px spacing, dots barely visible at 5% white opacity, laid over a deep charcoal radial vignette"`.
3. **Embossed graphite panels.** Any framed element (a card, a plaque, a browser window) should have a graphite gradient face (`#20232a → #15171c`), a 1px translucent-white border (~10% white), and a machined edge = subtle top highlight + darker bottom recess. Corners 16px (panels), 12px (controls), 22–28px (large tiles). Never pillowy, never sharp.
4. **Chrome / brushed-metal display type.** Big DeHub headlines are filled with a vertical brushed-metal gradient (`white 0% → #e6e9ed 38% → #9aa0a9 62% → #c4c9d0 100%`), Exo 800, UPPERCASE, wide tracking (0.04–0.06em). This is *the* DeHub display treatment — when the composition includes rendered display text, it should read as polished steel, not flat white.
5. **`//` mono annotation stamps.** JetBrains Mono, small, uppercase or sentence case, prefixed with `//`. Used as eyebrows and metadata stamps in the corners: `// JOIN NOW`, `// type = "affiliate"`, `// dehub.io`, `// file_type = image`. This is a brand signature — sprinkle sparingly in slide/poster corners when text is welcome.
6. **Glass over media.** When media (photo, video still, mock) appears, wrap it in a rounded panel with a 1px border and place a frosted-glass mono tag in a corner (`file_type = image`, blurred `rgba(16,18,22,0.72)` behind).
7. **Trident U mark + wordmark.** The alternative logo (`assets/dehub-logo-alternative.png`) is the trident "U" brandmark — use it as a compact standalone icon. The primary logo (`assets/dehub-logo-primary.png`) is the full wordmark — use it for the main lockup.
8. **QR corners.** A monochrome QR block in a slide corner is a valid DeHub motif for anything referral / share / affiliate related.
9. **Functional color = status only.** The only colors ever allowed on top of the monochrome base are the four status signals, and only when semantically justified: live-green `#34e0a1`, warn-amber `#ffc043`, alert-red `#ff5468`, info-blue `#5b9dff`. Live-green with a glow (`0 0 12px rgba(52,224,161,0.55)`) is the classic "live now in beta" pill accent.

**When the user is vague, default to one of two proven templates:**

- **"Statement" template** (like a keynote title slide) — thin rounded outer frame on the vignette+dot-grid canvas, oversized chrome UPPERCASE headline centered or upper-left, small `// eyebrow` above it, wordmark bottom-left, `// dehub.io` chip bottom-right. Reference: `assets/reference/template-signup.png` for structure.
- **"Media / feature" template** — split layout: left column has a live-green status pill, chrome UPPERCASE headline, one clause of body copy in muted grey; right column has a rounded embossed media panel with a glass `file_type = image` tag in the corner. Wordmark + trident bottom-left, `// type = "..."` chip bottom-right. Reference: `assets/reference/template-affiliates.png`.

Both templates share: dot-grid canvas, thin rounded outer frame (24px radius, 18px inset), chrome headline in Exo 800 uppercase, mono `//` chips in the footer corners, and the wordmark or trident in the opposite corner.

**How to bake this into the Nano Banana 2 prompt.** When the scene brief is loose, describe the canvas + frame + dot-grid + logo-host surface in the step-1 prompt so the scene *is* a DeHub layout, not a generic monolith. Example scaffold override for a vague brief:

```
A 16:9 DeHub marketing surface: deep charcoal radial vignette background (#0a0b0d fading to #060708 at the edges) overlaid with a faint blueprint dot-grid pattern — barely visible white dots at ~5% opacity spaced ~28px apart. A thin 1px translucent-white rounded frame (24px radius) insets 18px from the edges. Composition centered on an embossed graphite panel (graphite gradient face, 1px translucent-white border, subtle top highlight and darker bottom recess, 16px radius) that will host the DeHub wordmark. Small monospace `//` annotation stamp in the bottom-right corner reserved but currently blank. Strict monochrome — blacks, charcoals, silvers, chromes, cool off-whites only. Cinematic key light from upper-left, soft rim light, deep shadow falloff into the vignette corners. Machined, technical, Apple-keynote-meets-blueprint feel. Absolutely NO color hues, no lens flares, no neon.
```

If the user asked for `"live"`, `"beta launch"`, `"new"` framing, you may add one **live-green** pill accent (`#34e0a1` dot with soft glow) — but nothing else colored.

**Never hallucinate design-system elements.** The `//` stamps, mono chip text, and any rendered "DeHub" lettering must be added via a step-2 composite pass or via the real logo PNG — Nano Banana 2 will typo `dehub` half the time if left to render it raw. Reserve blank areas for text in step 1; drop the real logo in via `imagegen--edit_image` in step 2.


## Brand assets

Logos live in this skill's `assets/` folder:

- `assets/dehub-logo-primary.png` — primary wordmark (use by default)
- `assets/dehub-logo-alternative.png` — alternative wordmark (use for variety / dense compositions)

Both are **white-on-transparent**. They must always appear in white (or near-white). Never recolor, gradient-fill, drop-shadow heavily, distort, paraphrase, redraw, or allow the model to invent alternate DeHub lettering.

### Production app / social share image logo rules

When working inside the DeHub app codebase, **never generate, redraw, approximate, or substitute the DeHub logo**. Use the real project logo files:

- `src/assets/dehub-logo-white.png` — official full DeHub wordmark. Use this for headers, social cards, guide hero lockups, and any place where the brand name must be visible.
- `src/assets/dehub-logo.png` / `src/assets/dehub-logo-center.png` — official standalone DeHub icon mark. Use this only for compact badges or icon slots.
- `src/assets/dehub-logo-primary.png.asset.json` and `src/assets/dehub-logo-icon.png.asset.json` — CDN pointer versions of the official wordmark/icon when a CDN URL is needed.

For integrations, compose partner logos **beside the official DeHub assets**. For ChatGPT/OpenAI and Claude/Anthropic, use real full-color/official project logo assets such as `src/assets/ai-logos/openai.png` and `src/assets/ai-logos/anthropic.png`; do not use text-only placeholders, fake glyphs, simple colored dots, or AI-generated approximations.

If creating OG/share images for the app, build them by compositing the actual PNG assets in code or image tooling. Do not ask an image model to draw the DeHub logo — generated DeHub marks are invalid even if they look close.

## Brand style rules

These mirror the DeHub app design system — apply to every generated image. **Strict monochrome + metallic glass by default.** Anything else is off-brand unless the user explicitly asked for specific colors.

- **Palette — strict monochrome unless explicitly overridden by the user**: deep charcoal → black backgrounds (`#000`–`#0f0f10`), silvers, chromes, brushed-steel greys, cool off-whites, pure white highlights. **NO color hues by default** — no red, no orange, no yellow, no magenta, no purple, no violet, no green, no blue, no teal. Any tinted ambient light must be a **cool near-white** (barely-there cyan-white or silver-white glow, saturation under ~10%). If a swatch would read as a color name and the user did not specifically ask for that color, it's wrong.
- **Materials & texture**: liquid glass, frosted glass, polished chrome, brushed aluminum, obsidian, wet volcanic stone, mercury, holographic silver foil, oil-slick greyscale, smoked crystal. Every surface should have depth — reflections, refractions, subsurface scattering, subtle caustics. **Never a flat black background.** The background must have gradient falloff, atmospheric depth (soft grey mist / volumetric light), or a textured material (brushed metal, glass ripples, black marble). Flat #000 = fail.
- **Lighting**: cinematic key light from one direction (usually upper-left or upper-right), soft rim light on subject edges, deep shadow falloff into the negative-space region. Think product photography for a $10k watch or an Apple keynote hero shot.
- **Aesthetic reference**: Apple keynote × A24 poster × Zaha Hadid × Blade Runner 2049 interiors. Premium, restrained, expensive, decentralized-tech. Never "cyberpunk neon city" — that pulls in colored lights.
- **Composition**: strong focal hierarchy, generous negative space, logo placed with breathing room (min 8% of canvas as clear space around it). Rule of thirds or centered symmetry — never busy edge-to-edge chaos.
- **Typography in image** (only when text is explicitly requested): **Exo / Exo 2** (geometric technical sans, sharp uppercase, wide letter-spacing). Prompt language that reliably steers Nano Banana 2 toward Exo: `"typeset in Exo 2, geometric technical sans-serif, thin uniform strokes, sharp corners, wide letter-spacing"`. Always white or silver. Keep text minimal (1–5 words max) — Gemini's text rendering is fragile, and less text = higher chance it renders correctly. If the text still looks generic, regenerate rather than shipping it in the wrong typeface. No serifs, no script, no rounded/humanist sans. Fallbacks: Eurostile, Michroma, Rajdhani, Orbitron — never a generic default.
- **Hard bans**: no emoji, no purple/indigo gradients, no rainbow anything, no glossy 3D blobs, no "hero with arms up", no stock-AI cliché lens flares, no red/orange energy trails, no warm sunset tones, no fire, no lava.
- **Dimensions**: 1024×1024 square default; 1536×1024 posters/banners; 1024×1536 stories.

## Logo integration — the wordmark is PART of the scene, not stuck on top

The logo must feel like a real object *in* the scene, not a sticker slapped on afterward. To achieve this, the scene must be generated with a **physical logo surface** built into the composition — a specific object designed to hold the wordmark, matched to the scene's lighting, perspective, and material. Step 2 then integrates the real logo PNG into that surface so it inherits the scene. Unless the user explicitly specifies a different scene type, the scene should be composed around this logo surface as a primary hero object — not as a small mark in a corner, not with decorative objects placed around a flat pasted logo, and not as text floating over empty space.

**Logo involvement is mandatory by default.** If the user only asks for a poster/theme/message and does not describe a scene, invent a cinematic DeHub scene where the official wordmark is physically involved in the main subject: engraved across the face of a floating obsidian pavilion, milled into a brushed-steel creator key, backlit through a smoked-glass gateway, embossed into a mercury pool, or projected through charcoal mist from a chrome beacon. The logo host must be part of the architecture/product/landscape itself.

**Zero logo hallucinations.** The scene model must never draw or approximate the DeHub logo, never write "DeHub", never add fake letters, never add extra icons, and never create placeholder glyphs. Step 1 must reserve a perfectly blank, clean logo surface. Step 2 must use the real PNG only, preserve exact letterforms/proportions, and add no other text or symbols. If the final output contains warped letters, misspellings, duplicate logos, invented symbols, or any fake DeHub-like marks, discard and regenerate.

**Pick a logo surface for every scene** (drawn from the Brand DNA scene). Examples:

- Wordmark **engraved into obsidian** — a polished obsidian slab in the scene, with a subtle recessed etched panel where the wordmark will sit
- Wordmark **milled into brushed steel** — a brushed-aluminum plaque angled with the scene's key light
- Wordmark **backlit through smoked glass** — a translucent glass panel with a soft internal glow
- Wordmark **projected as light onto mist** — a volumetric holographic slab of cool-white light hanging in charcoal fog
- Wordmark **etched into a chrome monolith face** — a mirror-chrome vertical face oriented toward camera
- Wordmark **cast as shadow on marble** — a soft cast shadow on a slab of black marble, wordmark reads as absence of light
- Wordmark **embossed on mercury** — a raised relief on a mercury pool's surface, catching the rim light
- Wordmark **frosted into glass** — a frosted-glass panel where the mark reads as clear-through-frost

The step-1 scene prompt must explicitly describe this surface — its material, its position, its orientation, its lighting, and the fact that its face is **currently blank** (so step 2 can place the real logo there without conflict). The scene is invalid if there is no clear physical surface for the logo to inhabit.

## Default prompt scaffold

Structure the prompt like this — **dense and specific, 100–160 words**. Every prompt must include: subject, materials, lighting, background texture, and an explicit **logo surface** built into the scene.

```
[SPECIFIC SUBJECT with material description — e.g. "a monolithic obsidian pavilion floating over a mirror-black lake"] rendered in strict monochrome — blacks, charcoals, silvers, chromes, cool off-whites only, unless the user explicitly requested a specific color accent. Cinematic key light from [DIRECTION] with soft rim light and deep shadow falloff. Background: [SPECIFIC textured backdrop — e.g. "volumetric charcoal mist with faint silver-white light shafts", "black marble with subtle grey veining"] — NEVER flat black.

The scene is composed around a physical DeHub logo host. Built into the composition at [POSITION — e.g. "the centered vertical face of the pavilion"], a [LOGO SURFACE — e.g. "polished obsidian slab with a subtly recessed rectangular panel", "brushed-aluminum plaque catching the key light", "backlit smoked-glass panel with soft internal glow"] sized for a wordmark lockup roughly [SIZE — e.g. "40% of the scene width"]. This panel's face is currently perfectly BLANK and clean — do NOT draw a logo, the word DeHub, letters, glyphs, placeholder marks, icons, or text on it. Match the panel's perspective, lighting, and material to the scene so it feels physically present.

Materials throughout: liquid glass, frosted crystal, polished chrome, subtle caustics, subsurface scattering. Premium product-photography feel — Apple keynote meets A24 poster. Absolutely NO color hues unless explicitly requested by the user: no red, orange, yellow, magenta, purple, green, blue, teal. Any glow must be cool near-white (saturation under 10%). No lens flares, no rainbow, no neon. Shot on Hasselblad, 85mm, f/2.8, ultra-sharp, 4k, gallery quality.
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

1. Confirm intent (poster, social card, banner?) and any specific message/theme — ask only if truly ambiguous. If the user gave no scene direction, **invent one from the Brand DNA section and make the logo host the hero of that scene** — never default to a plain monolith, empty room, or pasted corner logo.
2. Pick logo variant (primary by default), dimensions (1024×1024 square default; 1536×1024 poster/banner; 1024×1536 story), and — critical — a **logo surface** from the Logo Integration section that fits the scene.
3. **Step 1 — Generate scene** with `imagegen--generate_image`:
   - `model`: `"gemini-3.1-flash-image"` (Nano Banana 2). Do not switch unless the user explicitly named a different model.
   - `prompt`: built from the scaffold above — subject + materials + lighting + textured background + **explicit blank logo surface** built into the scene (material, position, orientation, lighting). The blank surface is what makes the logo look integrated, not stuck on. Include a strict negative instruction: no logo, no "DeHub" text, no fake letters, no glyphs, no placeholder marks, no extra symbols.
   - `target_path`: `/mnt/documents/dehub-<slug>-bg.jpg`
   - `width` / `height`: chosen dimensions
4. **Step 2 — Composite the logo into the scene surface** with `imagegen--edit_image`:
   - `image_paths`: `["/mnt/documents/dehub-<slug>-bg.jpg", ".agents/skills/dehub-poster/assets/dehub-logo-primary.png"]` (or the alternative wordmark)
   - `prompt`: `"The first image contains a [SURFACE — e.g. 'polished obsidian slab', 'brushed-aluminum plaque', 'backlit smoked-glass panel'] at [POSITION]. Integrate the DeHub white wordmark from the second image into that surface as if it is physically part of it — [e.g. engraved into the obsidian with subtle recessed depth, milled into the brushed aluminum, backlit through the frosted glass with soft internal glow, projected as cool-white light onto the mist]. Match the scene's perspective, surface curvature/angle, key-light direction, contact shadows, reflections, and shadow falloff so the wordmark inherits the scene's lighting and material. Keep the mark pure white / cool near-white and preserve the exact letterforms, proportions, spacing, and aspect ratio from the PNG. Do NOT redraw, paraphrase, stylize, stretch, replace, or hallucinate the typography. Do not add any other letters, fake DeHub marks, icons, text, duplicate logos, or symbols. Do not place the logo as a flat sticker floating above the scene; it must be embedded in the named physical surface. Do not alter anything else in the scene."`
   - `target_path`: `/mnt/documents/dehub-<slug>.png`
5. **Self-check before showing the user.** View the final image and confirm: (a) background has real texture/depth, not flat black; (b) zero color hues — only blacks, greys, silvers, whites — unless the user explicitly requested color; (c) logo reads as **part of the scene** (embedded in the named physical surface, matching perspective, inheriting scene lighting/contact shadows/reflections), not a sticker floating on top; (d) logo has no hallucinations — exact DeHub letterforms, no misspellings, no fake glyphs, no duplicate marks, no extra logos; (e) any typography is Exo-like (geometric, sharp, wide tracking) — regenerate if it looks like generic sans-serif; (f) composition feels premium and cinematic. If any fail, regenerate with a tighter prompt.
6. Show the final image. Offer 1 quick variant if the user wants tweaks.

## Don'ts

- **Don't ever produce a flat pure-black background.** Backgrounds must have texture, gradient, atmospheric depth, or a real material (marble, brushed steel, misted glass, obsidian, mercury). Flat #000 is the #1 failure mode.
- **Don't use any color hues unless the user explicitly asked for them.** No red, orange, yellow, magenta, purple, violet, green, blue, teal by default. Monochrome only — blacks, greys, silvers, chromes, whites. If a swatch has a nameable hue and the user did not request it, regenerate.
- **Don't let the logo look stuck-on.** If the scene didn't include a physical surface built for the wordmark, regenerate the scene — don't try to composite onto empty space. If the composite looks like a flat sticker instead of engraved/milled/backlit/projected material, regenerate.
- **Don't submit a lazy scene.** "Abstract dark background" or "empty room" is not a scene. Every generation must have a concrete subject drawn from the Brand DNA vocabulary.
- **Don't ship generic-sans typography.** If rendered text on the poster looks like default Arial/Inter/Helvetica, regenerate with a tighter Exo prompt or reduce the text to 1–3 words.
- Don't switch models away from Nano Banana 2 unless the user literally named a different one.
- Don't let the scene model render the logo — always composite the real PNG in step 2. Reject any scene containing fake logo/text artifacts before compositing.
- Don't recolor the logo (beyond inheriting cool scene lighting), add gradients to it, or place it on busy areas without clear space.
- Don't skip the self-check step. Shipping an ugly image because "the tool returned it" is not acceptable.
- Don't save outputs into `src/assets/` unless the user explicitly wants the image shipped into the app.





