

## Audio Post Thumbnail: Static Waveform with Liquid Glass

**What**: Replace the plain black audio post background with a static SVG waveform visualization (like the attached reference image) rendered inside a liquid glass styled container. The waveform acts as a subtle decorative backdrop — not tied to live audio data — while the existing `AudioVisualizer` overlays on top for live playback.

### Changes

**1. New component: `src/components/app/audio/StaticWaveform.tsx`**
- A pure SVG/canvas component that draws a randomized-but-deterministic waveform bar pattern (seeded from `tokenId` so each post looks unique)
- Renders ~80-120 vertical bars with varying heights in a smooth envelope shape (like the reference image)
- Bars use `hsl` color with low opacity (white/20 to white/40) for the subtle liquid glass feel
- Accepts `className` for sizing and optional `color` prop (defaults to white with low alpha)

**2. Update `VideoCard.tsx` audio section (~lines 1194-1210)**
- Replace the current `<img> + bg-black/40` background with:
  - A container styled with liquid glass aesthetics: `bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl`
  - `StaticWaveform` rendered as a subtle background layer (centered vertically, spanning full width, ~40% height, low opacity)
  - `AudioVisualizer` overlaid on top as before for live playback
- If `video.thumbnail` exists and is a real cover art, show it as a blurred background behind the waveform; otherwise use the dark glass surface alone

**3. Visual result**
- Idle state: dark glass surface with subtle static waveform bars (like the reference), play button centered
- Playing state: `AudioVisualizer` animates over the static waveform, style picker and color controls visible

