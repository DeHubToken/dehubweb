---
name: dehub-poster
description: Generate DeHub-branded posters, social images, banners and OG cards in the official "SM Template 2.0" monochrome chrome style. Triggers on requests like "make me a dehub poster", "dehub content", "dehub social image", "dehub banner", "dehub announcement graphic", or any DeHub image generation request.
---

# DeHub Poster & Content Generator (SM Template 2.0)

Use this skill whenever the user asks for a DeHub-branded image: posters, social cards, announcements, banners, blog art, OG cards, thumbnails.

**The house style is SM Template 2.0** — the same design language as the blog banners, the per-route OG cards and the @dehub_official social posts. It is a *deterministic code render*, not a diffusion picture. Read `assets/reference/sm-template-2-landscape.jpg` and `assets/reference/sm-template-2-portrait.jpg` before generating anything: that is what "on brand" means here, and every rule below exists to reproduce it.

## Two renderers — pick the right one first

| | when | how |
|---|---|---|
| **`template`** — the default | any DeHub banner/poster/social/OG request with no attached image and no cinematic archetype named | server-side SM Template 2.0 render. Deterministic, **free**, seconds. |
| **`scene`** — the exception | the user picked a cinematic archetype (Apple Keynote, A24, sci-fi key art…), attached a source image to edit, or explicitly asked for a photoreal/3D scene | Nano Banana 2 diffusion, two-step (scene → logo composite). Costs credits. |

**Default to `template`.** A vague brief ("make a DeHub poster", "announcement graphic", "content for X") is a template request — do NOT invent a cinematic monolith scene for it. The Poster Studio's `detectStyle()` already returns `dehub-template` unless the prompt names an archetype; respect that default instead of talking the user out of it.

Where it runs:
- Server twin: `supabase/functions/_shared/dehub-template-banner.ts` (SVG + resvg-wasm, assets from `dehub.io/brand-kit/` = web copy of `public/brand-kit/`).
- Routing: `supabase/functions/generate-image/index.ts`, the `useTemplate` line.
- Client: `src/components/app/assistant/PosterConfigDialog.tsx` (web) / `components/Assistant/PosterConfigSheet.tsx` (mobile) → `bannerRenderer: 'template' | 'scene'`.
- Local generator and the canonical source of the look: the banner kit's `style-v2.mjs` / `compose-social.mjs`.

Two behaviours worth knowing:
- **Template renders are free.** `isFreeTemplateRequest(body)` = `bannerRenderer === 'template' && !sourceImage`. Never quote a credit price or push a paywall for one.
- Because they are free, a template failure returns a hard **503 `TEMPLATE_RENDER_FAILED`** — it does *not* silently degrade to diffusion. A broken template means posters are down, not merely off-style. If a user reports "poster failed", check the edge function, not the prompt.

## The design language (non-negotiable)

Everything here is what the renderer already does. Describe it accurately when briefing the spec, and check it when reviewing output.

**Canvas.** Black; rounded card inset ~20px; four dim mono `✕` glyphs OUTSIDE the card at the extreme canvas corners.

**The card edge is a BEVEL, not a border.** A flat 1px border has one value all the way round and looks pasted on. The real edge is a 1px ring whose brightness *sweeps* the perimeter — bright at the top-left catch (~46% white), falling to ~5% through the middle, picking up again to ~38% bottom-right — so the card reads as a raised slab. A softer inner lip deepens it; a wide outer drop shadow lifts it off the canvas.

**Background — silk is the BASE, stars/grid are an OVERLAY on it.** Layer order: silk texture → blurred dust blobs → the dotted lattice → starfield (~300 dots plus a few cross-flared stars) → vignette → dot grid → scattered `✕ + ·` marks → film grain on top. The overlay is **per-post opt-in** — vary it across a batch; silk-only must still read as the same system.

**The lattice is dots, not graph paper.** Dotted runs with a slightly brighter dot at each node, very faint (~.115 alpha on the runs, ~.22 on the nodes). Solid 1px rules read as an engineering drawing laid over the art. And it must never tile flat — it is masked with a radial fade so it rakes across the canvas, strongest at the top-left catch, gone by the lower-right where the hero sits. A uniform-strength overlay is the giveaway that something was generated rather than composed.

**Headline.** Exo 700 UPPERCASE, tracking ~-0.022em, line-height ~0.92, ~0.185–0.215 × canvas height.
- The gradient is a **horizontal sweep**, not vertical: mid-grey at the left ramping to pure white ~65–70% across, easing to light grey at the right. The brightest type sits nearest the hero's light.
- **The sweep carries ALPHA as well as tone** — the leading glyphs are semi-transparent (~.34 rising to 1.0 by ~62%) so the silk and light shafts read straight *through* the letters before they go opaque. That transparency is what seats the type inside the image instead of on top of it.
- Grain is textured onto the glyphs themselves, not just the canvas.
- **Focus ramp:** the FIRST letters are soft and sharpen as they move right into the light (`blurMode:'lead'`). `'trail'` — blurring the trailing letters — is the legacy blog-banner convention only.
- Tight dark drop shadow plus a wide soft white bloom.
- **Multi-line headlines share ONE sweep across the whole block.** In SVG that means `userSpaceOnUse`, not `objectBoundingBox` — per-line bounding boxes restart the ramp, so a 3-letter line and a 7-letter line each run the full grey→white→grey sweep and the two lines read as different tones.

**Alignment — the thing most often got wrong.**
- ONE left gutter (~5.2% of width landscape, ~7.5% portrait) shared by the pill, the headline and the sub row. The headline needs a ~-.085em left nudge and the sub ~-.03em to cancel Exo's left side bearing; without it the type looks indented against the pill and reads as sloppy.
- ONE bottom baseline (~10.4% of height up from the bottom) whose **centre line** is shared by the wordmark pill, the `//dehub.io` box and the QR. Centre, not bottom — their heights differ.
- Top tag box and QR share a right gutter (~4.2%).

**HUD chrome.**
- **Boxes are NOT dashed rectangles. They are four CORNER BRACKETS** — one short L-shaped mark at each corner, middles of the edges completely empty, like crop marks. A repeating dash pattern is the classic wrong answer: it looks technical, it survives a glance, and it is visibly not the brand. Arm length is fixed (~15px h / 12px v at 1920), never a percentage, so every box's brackets match regardless of box size. Stroke ~46% white over a near-black fill at ~.80 alpha — at ~.42 the marks compute darker than bright chrome behind them and vanish.
- Top-right: **two-line** tag — `// type =` dim on line 1, the value on line 2.
- Bottom-left: solid white DEHUB wordmark pill with an outer glow.
- Bottom-centre-left (~47%): `//dehub.io` in a bracketed box.
- Bottom-right: QR, no border, **but on a dark backing plate** — the hero bleeds under it and white QR modules on polished chrome will not scan.

**Hero.** ONE big content-matched chrome icon that **bleeds off the right and bottom edges** — it is not contained in the frame. Radial white glow behind it, deep drop shadow. Pick the icon for the CONTENT, never generic coins for a non-money topic. Two failure modes to check every time:
- **Cut on three edges.** Oversize the hero and it also clips the TOP, putting bright chrome behind the `// type =` tag and washing it out. Bleed right + bottom only.
- **Tangent, not bleed.** A round hero placed barely past the edge merely *kisses* the border and curves away, which reads as contained-and-nicked. Push it far enough that the edge cuts a real chord through it.

**STRICTLY monochrome.** Blacks, charcoals, silvers, chromes, cool off-whites, pure white. **No colour accents at all** — not a status pill, not a live-green dot, not a tinted glow. Every colour accent tried so far has been rejected. The reference renders look faintly blue in places; that is JPEG cast, not a hue. Any ambient tint must be a cool near-white under ~10% saturation.

**`pillPos`.** The wordmark pill defaults to bottom-left (poster/social composition). **Blog banners pass `pillPos:'top'`** — blog cards crop the banner bottom-anchored, so top elements are hidden on the card and appear only on the post page, and the pill is parked there deliberately to keep card thumbnails clean. With the pill at the top the type tag drops to the bottom-left automatically.

## Formats

One set of fractional measurements scales to every aspect, so a format is a table row, not a redesign:

| key | size | for |
|---|---|---|
| `hd` | 1920×1080 | YouTube, hero, 16:9 |
| `og` | 1200×630 | LinkedIn, Facebook, Farcaster frame, Telegram, Discord |
| `x` | 1200×675 | X / Twitter |
| `ig` | 1080×1350 | Instagram feed 4:5 |
| `story` | 1080×1920 | Story, Reel, TikTok, Shorts cover |

Landscape = headline left / hero right. Portrait = headline left-aligned high, hero low and bleeding off the bottom. **Portrait needs its own hero geometry** — reusing landscape numbers puts the hero straight through the headline. Check the sub row clears the hero top.

The Poster Studio's dimension presets map onto these: Square → 1:1 `ig` geometry, Poster/portrait → `story`, Banner/landscape → `hd`/`og`, Story → `story`.

## Writing the spec

The template is filled from a small structured spec, not a paragraph of prose. When briefing it, supply:

- **Headline** — 2–5 words, uppercase, ideally two short lines. Declarative and human ("OWN THE FEED", "PAID FROM VIEW ONE"), never a feature name bolted to a verb.
- **Sub** — one `//SNAKE_CASE_LINE` under the headline, a counter-statement or proof (`//NO_ALGORITHM_OWNS_YOU`, `//NO_THRESHOLD_TO_CROSS`). Not a sentence.
- **Type tag** — the one-word value for `// type =` (movement, creators, stages, shipping…).
- **Icon** — the chrome hero matched to the content.
- **Layout** — format, `pillPos`, `overlay` on/off, `blurMode`.

If the spec call fails there is a zero-AI heuristic fallback, so a dead model key does not break the template — but a lazy spec produces a bland-yet-valid banner, which is worse than a failure because it ships.

## Brand assets

Logos live in this skill's `assets/` folder:

- `assets/dehub-logo-primary.png` — primary wordmark (default)
- `assets/dehub-logo-alternative.png` — alternative wordmark (variety / dense compositions)

Both are **white-on-transparent** and must always appear white or near-white. Never recolor, gradient-fill, heavily shadow, distort, paraphrase, redraw, or let a model invent alternate DeHub lettering.

The template renderer draws the wordmark from `public/brand-kit/brand/`; its icons and silk textures come from `public/brand-kit/icons/` and `public/brand-kit/bg/`. If kit assets change, `public/brand-kit` must be regenerated — the edge function fetches it over HTTP from `dehub.io/brand-kit/`.

### Production app / social share image logo rules

When working inside the DeHub app codebase, **never generate, redraw, approximate, or substitute the DeHub logo**. Use the real project files:

- `src/assets/dehub-logo-white.png` — official full wordmark. Headers, social cards, guide hero lockups, anywhere the brand name must be visible.
- `src/assets/dehub-logo.png` / `src/assets/dehub-logo-center.png` — official standalone icon mark, for compact badges or icon slots only.
- `src/assets/dehub-logo-primary.png.asset.json` and `src/assets/dehub-logo-icon.png.asset.json` — CDN pointer versions when a CDN URL is needed.

For integrations, compose partner logos **beside** the official DeHub assets. For ChatGPT/OpenAI and Claude/Anthropic use the real assets (`src/assets/ai-logos/openai.png`, `src/assets/ai-logos/anthropic.png`) — never text placeholders, fake glyphs, coloured dots, or AI approximations.

OG/share images for the app are built by compositing real PNG assets in code or by the template renderer. Do not ask an image model to draw the DeHub logo; a generated DeHub mark is invalid even when it looks close.

## The scene path (fallback only)

Use this **only** when the user picked a cinematic archetype, attached an image, or explicitly asked for a photoreal/3D render. It costs credits and it will never match the template's chrome exactly — say so if the user expected the house style.

**Model.** Nano Banana 2 (`google/gemini-3.1-flash-image`) for both steps unless the user names another. Step 1 (scene) → `imagegen--generate_image` with `model: "gemini-3.1-flash-image"`. Step 2 (logo composite) → `imagegen--edit_image` with `model` unset.

**Scene vocabulary** — pick one subject, one material, one atmosphere; never a generic monolith or empty room:

- **Architectural** — floating obsidian pavilion, chrome monolith, cantilevered brushed-steel platform, mirrored glass amphitheatre, weightless silver ring in mist
- **Product-hero** — smoked-glass hardware wallet on a plinth, mercury sphere over a chrome disc, stack of translucent smoked-crystal cards, a single silver key in fog
- **Landscape** — mirror-black lake under silver mist, moonlit obsidian dunes, monochrome range in cold moonlight, chrome desert horizon
- **Abstract** — liquid mercury frozen mid-splash, smoked-glass helix, a ribbon of brushed steel curling through space, silver shards suspended weightlessly
- **Human presence (rare, silhouette only)** — a lone silhouette in a chrome corridor. Never a face, never a full character.

**Theme translation — monochrome by default.** Whatever theme is named (Christmas, summer, airdrop, Halloween, Valentine's, hackathon, milestone), translate it into DeHub's *material* vocabulary, never its stereotypical palette: Christmas → silver frost on obsidian, never red/green/gold. Summer → chrome sun disc over a mirror-black lake, never orange/yellow. Halloween → matte obsidian skull on a silver plinth, never orange/purple. Airdrop → silver capsules through charcoal fog, never confetti. Valentine's → mirrored chrome hearts, never red/pink. Milestone number → sculpted in polished chrome, never gold. Rule of thumb: gold → chrome, red → obsidian with a silver rim, green → brushed dark steel with a cool white glow, warm light → cool near-white. If the user explicitly requests a colour, allow it only as a restrained accent and keep the wordmark white and the scene mostly black, silver, chrome, glass.

**The wordmark is PART of the scene, not stuck on top.** Step 1 must build a **physical logo host** into the composition — a specific object designed to hold the wordmark, matched to the scene's lighting, perspective and material — and leave its face perfectly BLANK. Step 2 composites the real PNG into that surface. Hosts: engraved into obsidian · milled into brushed steel · backlit through smoked glass · projected as light onto mist · etched into a chrome monolith face · cast as shadow on black marble · embossed on mercury · frosted into glass. A scene with no such surface is invalid — regenerate it rather than compositing onto empty space.

**Zero logo hallucinations.** The scene model must never draw or approximate the logo, write "DeHub", add fake letters, extra icons or placeholder glyphs. Warped letters, misspellings, duplicate logos or invented marks in the final output = discard and regenerate.

**Scaffold** — dense and specific, 100–160 words:

```
[SPECIFIC SUBJECT with material — e.g. "a monolithic obsidian pavilion floating over a mirror-black lake"] rendered in strict monochrome — blacks, charcoals, silvers, chromes, cool off-whites only. Cinematic key light from [DIRECTION] with soft rim light and deep shadow falloff. Background: [SPECIFIC textured backdrop — e.g. "volumetric charcoal mist with faint silver-white light shafts", "black marble with subtle grey veining"] — NEVER flat black.

The scene is composed around a physical DeHub logo host. Built into the composition at [POSITION], a [LOGO SURFACE — e.g. "polished obsidian slab with a subtly recessed rectangular panel", "brushed-aluminium plaque catching the key light", "backlit smoked-glass panel with soft internal glow"] sized for a wordmark lockup roughly [SIZE — e.g. "40% of the scene width"]. This panel's face is currently perfectly BLANK and clean — do NOT draw a logo, the word DeHub, letters, glyphs, placeholder marks, icons, or text on it. Match its perspective, lighting and material to the scene.

Materials throughout: liquid glass, frosted crystal, polished chrome, subtle caustics, subsurface scattering. Premium product-photography feel — Apple keynote meets A24 poster. Absolutely NO colour hues unless explicitly requested: no red, orange, yellow, magenta, purple, green, blue, teal. Any glow must be cool near-white (saturation under 10%). No lens flares, no rainbow, no neon. Shot on Hasselblad, 85mm, f/2.8, ultra-sharp, 4k, gallery quality.
```

**Step 2 composite prompt:** name the surface and the position, ask for the wordmark to be integrated *as part of it* (engraved / milled / backlit / projected), matching perspective, surface angle, key-light direction, contact shadows, reflections and falloff; keep the mark pure white and preserve exact letterforms, proportions, spacing and aspect ratio from the PNG; no other letters, no fake marks, no duplicates, no sticker floating above the scene, nothing else in the scene altered.

Typography inside a scene render: **Exo / Exo 2** only, white or silver, 1–5 words maximum — Gemini's text rendering is fragile and every extra word is another chance to typo. Prompt language that steers it: `"typeset in Exo 2, geometric technical sans-serif, thin uniform strokes, sharp corners, wide letter-spacing"`. Fallbacks Eurostile, Michroma, Rajdhani, Orbitron — never a generic default. If it renders as Arial/Inter/Helvetica, regenerate.

Dimensions: 1024×1024 square default; 1536×1024 poster/banner; 1024×1536 story.

## Official brand links

Include these only if the user explicitly asks for socials, website, links, contact or QR. Otherwise omit — the template already carries `//dehub.io` and the QR.

- **Website**: `dehub.io`
- **X / Twitter**: `x.com/dehub_official`
- **Telegram (main)**: `t.me/dehub_dhb`
- **Discord**: `discord.gg/dehub`
- **Regional Telegrams**: Turkish `t.me/Dehub_Turkish` · Arabic `t.me/Dehub_Arabic` · Hindi `t.me/dehub_hindi` · China `t.me/dehub_china` · Indonesia `t.me/dehub_indonesia` · Germany `t.me/dehub_dach` · Vietnam `t.me/dehub_vietnam` · Philippines `t.me/DeHub_Philippines`

Rendering rules: pure white, Exo / Exo 2 Light or Regular, small, along the bottom, generous letter-spacing, no coloured icons. Only the links actually asked for — "with socials" = X + Telegram + Discord + Website; "with website" = just `dehub.io`. Never invent or shorten handles.

## Caption voice (when the image ships as a social post)

The graphic is half the post. Match @dehub_official or it reads as an ad:

- **No hashtags.** Zero in first-party posts; they appear only in retweeted community posts.
- **No `$DHB` shilling.** Say "tokens", "contracts", "coin purchase". Save the cashtag for when the contract genuinely is the news. No price, TA, or moon talk, ever.
- Sentence case. Short lines with a **blank line between nearly every sentence**. 3–5 lines typical.
- **One leading emoji as a category badge**: 🚨 contract/urgent · 📢📣 announcement · 🎙️ Stages · ⚡️ speed/shipping · ✅ shipped · 🌌 house emoji.
- Links are **bare paths, no protocol**, on their own final line: `dehub.io/apk`.
- Two registers — the manifesto (anti-censorship, aphoristic, parallel triads) and the shipping log (dated, ✅-bulleted, names versions, admits friction). Pick one; don't blend.
- Recurring lines: "open source and user owned since 2021", "censorship resistant & permissionless", "legacy social media", "Community first - Always", "creators deserve better".
- **Reddit is exempt from all of the above** — a banner + link there gets the account buried. Text post, admit a tradeoff, ask a question, no image.
- **Never generate a statistic.** An invented growth or user number on a real brand account is a serious error. Use verifiable lines ("since 2021") instead.

## Workflow

1. Read the brief. Unless the user named a cinematic archetype, attached an image, or asked for photoreal — **it is a template request**. Do not offer to render a scene instead.
2. Pick format (see the table), `pillPos`, `overlay`, and — critical — the **content-matched chrome icon**. Never generic coins for a non-money topic.
3. Write the spec: headline (2–5 words, two short lines), `//SNAKE_CASE` sub, one-word type tag.
4. Render. Template renders are free — no paywall, no credit quote.
5. **Look at the output yourself before showing it.** Check, in this order: left gutter agreement (pill / headline / sub on one line); bottom baseline agreement (pill / `//dehub.io` / QR centres aligned); headline still legible where it crosses bright chrome; QR sitting on its dark plate; hero bleeding right + bottom only, not clipped at the top; corner brackets visible, not dashes; zero colour. Any failure → fix the spec and re-render.
6. Show it. Offer one variant if they want tweaks.

If the render returns 503 `TEMPLATE_RENDER_FAILED`, that is a server fault, not a bad prompt — say so plainly rather than retrying the same brief or quietly switching to paid diffusion.

## Don'ts

- **Don't reach for diffusion on a vague brief.** "Make a DeHub poster" is the template's job. Inventing a cinematic monolith scene is the single most common way to ship something off-brand and bill for it.
- **Don't use any colour.** No status pills, no live-green dot, no neon ambient glow, no tinted light. Monochrome only — blacks, greys, silvers, chromes, whites. If a swatch has a nameable hue, it's wrong.
- **Don't draw HUD boxes as dashed rectangles.** Four corner brackets, empty edge middles.
- **Don't break the two alignment rules** — one left gutter, one bottom baseline through the centres of the pill, the `//dehub.io` box and the QR.
- **Don't let the hero be contained.** It bleeds off the right and bottom. A hero that merely kisses the edge reads as a mistake.
- **Don't put the QR on bare chrome.** It needs its dark backing plate or it will not scan.
- **Don't ship a flat pure-black background** on the scene path. Texture, gradient, atmospheric depth, or a real material. Flat #000 is the #1 failure mode there.
- **Don't let the logo look stuck-on** in a scene render, and never let the scene model draw it — composite the real PNG.
- **Don't ship generic-sans typography.** If it looks like Arial/Inter/Helvetica, regenerate or cut the text to 1–3 words.
- **Don't quote a price for a template render.** They are free by decision.
- **Don't skip the self-check.** Shipping an ugly image because "the tool returned it" is not acceptable.
- Don't save outputs into `src/assets/` unless the user explicitly wants the image shipped into the app.
