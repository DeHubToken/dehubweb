---
name: dehub-ui-craft
description: DeHub's craft rules for product UI on phone web and the app (restraint, spacing, type, icons, colour, motion, sheets) plus how to build feature-card and promo stills from real DeHub screens. Use when designing or reviewing any DeHub screen, component, animation, bento, feature card or "make this look sick" request, and before calling UI work done.
type: design
---

# DeHub UI Craft

The bar for every DeHub screen: **it reads as a finished product, simplified to what the person needs, framed with intent, and every motion has a cause.**

These rules adapt the still-frame and motion principles of Benji Taylor's *Stageshow* (MIT, `github.com/benjitaylor/skills`, write-up at `benji.org/stageshow`) to a real, shipping social app. Stageshow itself is for faux marketing UI; the section *Feature cards and promo stills* covers that use. Everything else here is about the live product.

DeHub house rules still win where they are more specific: liquid glass bars and drawers, System theme = no bentos, the page kit, the state gallery, per-theme icons. See `.agents/skills/glass-toggle-bar` and the page kit (`src/components/app/page-kit/`).

## The five ways a screen fails

- **Too much.** Every row carries a count, a badge, a timestamp and three buttons. The more detail, the cheaper it looks.
- **Wireframe.** Gray blobs, an empty state with no picture, a skeleton that never resembles the real row.
- **Boxed.** A card inside a card inside a bento, even margins on every side, nothing bleeds.
- **Flat.** Every element the same weight in the same bordered box. The eye has nowhere to land.
- **Bland.** The theme's character (Osaka neon, Jungle canopy, Horror torchlight) watered down to "gray app with an accent".

Fix: one clear subject per screen, quiet supporting chrome, room to breathe, and the theme's look in full.

## Restraint

- **One subject per surface.** Decide what the screen is about (the post, the stream, the chat) and give it the heaviest marks. Everything else steps back.
- **Say it once.** A state (boosted, live, verified, pinned) shows in one place, not in the header, the row and a toast.
- **One number gets to be big.** On stats, wallets and profiles one figure leads; the rest are normal text.
- **In a small surface a row is one line:** avatar, name, value. Do not stack a gray caption under every name in a popover or sheet.
- **Label and value match.** No blank pill beside a real control; leave it out until it has content.
- **Keep the signature content:** avatars, thumbnails, album art. Do not replace them with generic icons to "clean up".
- **Simplify before polishing:** the fewest surfaces and strings, then borders and badges only where earned.
- **Cut repeated framing, not imagery.** An empty white card is not the cure for clutter.
- **Judge the silhouette first.** At thumbnail size (squint at a 390 wide screenshot) the subject, the support and the empty space should make one picture.

## Type

- **11 to 15px for UI text on phones**, 13px minimum for anything a person must read; never below 11px.
- **Line height at least 1.3** for small text; every text slot needs clearance on all sides.
- **Fit the text before fixing the box.** If a label is clipped or ellipsised at 360 wide, shorten the label or let the control grow; do not shrink the font.
- **One family per theme.** Monospace only for code, addresses, hashes and aligned numbers.
- **Sentence case.** Hierarchy from spacing and one weight step, not from caps, colour and size all at once.

## Spacing and alignment

- **Words keep a 12px inset** from the edge of a card, sheet, pill or hovered row. Under 8px reads as touching.
- **A button keeps 8px or more** from the field, line or card edge above it.
- **Row padding 12px**, 8px for dense lists. A one-line row three times taller than its words is a fat row.
- **A title and its subtitle read as one item:** 2 to 6px between them; the air comes from the row padding.
- **Text never touches a neighbour:** a fixed `gap` of 8 to 12px, never leftover `space-between`.
- **Nested shapes pad evenly** and radii nest: outer radius = inner radius + padding. A pill inside a 20px-radius sheet with 8px padding has a 12px radius.
- **Carry the inset round the bottom.** The last action in a sheet keeps the same inset as the top, plus the safe area.
- **No near-tangents.** Edges 1 to 3px apart look like accidents: line them up exactly or part them by 8px or more.
- **Dots, badges and rings sit fully inside the content edge,** never clipped by the avatar or the card.
- **Centre labels on their letters.** A label beside an icon or inside a pill reads low in a plain line box; trim with `text-box: trim-both cap alphabetic` where supported, or nudge by eye.
- **A centred amount centres its digits;** the currency sign or token symbol hangs outside.
- **A control hugs its content;** never `flex: 1` with its content stuck at one end.
- **Columns line up:** rows in one list share one grid, optional content keeps its slot.
- **Whitespace groups:** a title sits closer to its own metadata than to the next item.

## Icons

- **Icons come from the theme's set** (`theme/icons` in the app, the per-theme artwork on web). Never draw a glyph by hand; a hand-drawn glyph never matches its neighbours.
- **One family, one stroke, one size** (16 to 24px on phones) per surface.
- **Small icons are filled.** At 14px and under thin outlines go wiry.
- **Icon buttons and chips get `flex: none`** (`flexShrink: 0` in the app) so they never squeeze.
- **Emoji are content, never icons.**
- **AI features get no sparkles, wands or purple glow** as decoration. Show what the feature does.
- **No invented logos** (a letter in a coloured square). Use the real mark or a plain wordmark.
- **Centre glyphs by eye:** a play triangle shifts toward its point by about a sixth of its width.

## Colour and surfaces

- **One neutral family per theme** for page, sheet and cards; a different material (glass) differs on purpose.
- **Five inks and one accent to start.** Status colours mean status only.
- **No redundant borders.** Try the fill alone; add a hairline only for separation or state.
- **Quiet is not faint:** check text and actions against the real ground on every theme (run the WCAG scanner from the light-contrast audit).
- **A gradient or glow serves the story or goes.**
- **Do not ring the thing you want noticed.** A halo around a card reads as a focus state nobody gave it. Lift it with its surface, its shadow or an accent label.
- **A filled button keeps its colour when pressed:** one step of its own colour, never a gray swap.
- **Nothing translucent overlaps translucent.** Stacked avatars and chips get opaque fills.
- **On dark themes depth comes from a lighter surface,** not a bigger shadow.

## Motion (the live product)

- **Feedback is instant.** A press shows on the finger within a frame; only storytelling motion (onboarding, a reveal) slows down.
- **Every change moves.** Text that becomes a pill, a menu replaced by another, a number that jumps: slide, roll or morph instead of swapping in one frame.
- **Change only what changed.** Roll the digits of a like count that changed, not the whole label.
- **Nothing pops.** Sheets, toasts, menus and reactions enter and stay mounted until their exit finishes.
- **No blank frames.** What replaces something arrives as it leaves; a sheet opens with its content already laid out, never an empty surface for a quarter second.
- **Neighbours make room as the newcomer arrives.** A new comment pushes the list down with its height, it does not appear and then shove.
- **An open surface holds its anchor.** A sheet is pinned by the edge it came from; a menu does not resize while open. Reserve the height of the longest content.
- **Solid things do not fade through.** Cards, sheets and players arrive by moving, opaque or nearly.
- **Toasts, pills and reactions arrive whole from just above,** never uncovered by a hard edge.
- **A resizing surface moves size and content together** and never stretches its text.
- **An object keeps its identity when it changes:** a plus turning into a close rotates the same strokes.
- **Button states share one slot:** idle, pending and done keep one footprint so the row never jumps.
- **Spinners turn before they are visible** and keep turning through the fade out.
- **Landings are soft:** decelerate over the last third, no bounce on surfaces (a small icon may overshoot).
- **Two curves:** travel `cubic-bezier(0.45, 0, 0.1, 1)`, arrival `cubic-bezier(0.25, 0.8, 0.25, 1)`. Stagger lists 40 to 80ms in reading order.
- **Colour changes between distant hues take about 200ms;** they pass through mud however you do them.
- **After motion nothing moves.** No settle snap, no 1px shift when a transform layer drops.
- **Respect reduced motion:** the end state must read on its own.

## Phones in particular

- **Nothing sits under the status bar, notch or home indicator.** Sheets and grabbers start below the safe area.
- **Tap targets at least 44 by 44pt,** even when the glyph is 18px.
- **Short lists sit at the top of their pane,** never pinned to the bottom with a void above.
- **Empty states are finished screens:** the theme's art, one line, one action.
- **Skeletons match the real row's geometry** (avatar size, line pitch) and resolve top to bottom.
- **At 360 wide nothing wraps a unit onto its own line** and no row clips its last button.
- **Desktop web never changes for a phone fix.** Gate phone-only CSS to phone width.

## Feature cards and promo stills

For blog figures, share cards, store screenshots, "what's new" bentos and launch posts (use with the `dehub-poster` skill for the frame and logo):

- **Build from real DeHub components** rendered on the state gallery or a fixture route, not a hand-drawn mock.
- **Count the real strings, usually 3 to 7:** the title, the thing acted on, what is typed, the result. Everything else is neutral filler bars or plain content.
- **Crop to the panel the story happens in.** The phone or window fills at least two thirds of the frame and runs off an edge; never a whole screen floating with even air on four sides, never a plate under it.
- **One satellite at most:** a smaller second object (a receipt, a notification, a stat chip) straddling the hero's edge.
- **The poster frame tells the story alone:** the result on screen, nothing caught mid-change.
- **An animation is 10 to 16 seconds, 3 to 5 beats, one payoff that holds for 2 seconds;** a loop resets with a visible cause or while hidden, never plays a navigation backwards.
- **A phone-column version is a redesign, not a squeeze.**
- For full faux-UI scenes (cursor walkthroughs, device pairs, bento grids) the upstream toolkit has a React kit, gold examples and a filming script: `npx skills add benjitaylor/skills --skill stageshow`. Swap its look for the DeHub theme tokens.

## Review checklist (run before calling UI done)

Screenshot at 390 wide and 360 wide, on System, System light, Hazy and one canvas theme (Osaka or Jungle), web and app. Then, as the pickiest designer you know would:

1. What does the eye land on first, and is it the subject?
2. Any word closer than 8px to an edge, or any two edges 1 to 3px apart?
3. Any clipped label, unit on its own line, or squeezed icon?
4. Any mixed icon weights, emoji used as an icon, or hand-drawn glyph?
5. Any state said twice, or a ring or glow pointing at something?
6. Any element that pops in, swaps in one frame, or shifts after landing?
7. Any surface that opens empty, resizes while open, or slides under the safe area?
8. Any empty band mid-screen while the content is pushed to the edge?

Fix the largest visible fault first (framing, then hierarchy, then motion, then polish), re-shoot, repeat.
