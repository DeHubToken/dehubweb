## Goal

While the per-user affiliate share image is loading on both `/affiliate` and `/r/:code`, show a shimmer skeleton in the exact image slot. Never render the generic "A creator invited you" / default placeholder — only ever show the personalised version once the user data has resolved.

## Changes

### 1. `src/pages/app/AffiliatePage.tsx`
- Add local `imgLoaded` state, reset to `false` whenever `shareImageUrl` changes (code or `imgVersion`).
- Wrap the `<img>` in the existing rounded container with:
  - Fixed aspect ratio box (`aspect-[1200/630]`) so the skeleton occupies the final image area.
  - Absolutely-positioned shimmer overlay (gradient sweep using existing `animate-pulse` plus a moving white/5 → white/20 → white/5 gradient — matches the project's liquid-glass aesthetic, no blue).
  - The `<img>` rendered with `opacity-0` until `onLoad` fires, then fades to `opacity-100`.
- Only render the share-image card when `stats?.code` is available. Until then, show the same shimmer block (so users never see a generic image or alt-text fallback).

### 2. `src/pages/ReferralLanding.tsx`
- Add `imgLoaded` state on the `<img>`, same fade-in pattern.
- Add `inviterLoaded` state — set to `true` only after the Supabase lookup resolves (success or miss).
- While `inviterLoaded` is `false`:
  - Render shimmer placeholders for the headline ("X invited you to DeHub") instead of the default "A creator" string.
  - Render the image slot as the shimmer skeleton (same aspect-ratio container).
- Once `inviterLoaded` is `true`:
  - If the code is valid and a real `share_name`/address was returned, render the personalised heading + image (image still fades in on its own `onLoad`).
  - If lookup returned nothing for a valid code, keep the heading minimal ("You've been invited to DeHub" with the code) — no "A creator" string.
- Keep the existing invalid-code branch unchanged.

### 3. Shimmer styling (inline, no new file)
Reuse Tailwind primitives already used elsewhere in the project:
```
<div class="absolute inset-0 overflow-hidden rounded-3xl bg-white/[0.04]">
  <div class="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
</div>
```
The `shimmer` keyframe already exists in `tailwind.config.ts` / `index.css` for other skeletons; if not, add a minimal `@keyframes shimmer { 100% { transform: translateX(100%); } }` to `src/index.css` (one small addition, no token changes).

### Out of scope
- No edge-function changes.
- No copy changes beyond removing the "A creator" fallback.
- No layout or spacing changes outside the image card / hero block.
