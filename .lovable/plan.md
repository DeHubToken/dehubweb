

## Plan: Add Static Waveform to Past Stages Thumbnails

### What
Add the existing `StaticWaveform` component (the white lines visualization used for audio post thumbnails) to past stage entries in the "See All" drawer. On desktop/tablet it appears to the right of the listener count; on mobile, the card layout stacks vertically with a larger waveform below the metadata.

### Changes

**File: `src/components/app/spaces/AudioSpacesModal.tsx`**

1. Import `StaticWaveform` from `@/components/app/audio/StaticWaveform`
2. Modify the past stages card layout (lines 230-277):
   - Add responsive classes: horizontal layout on `sm:` and up, vertical on mobile
   - On **desktop/tablet** (`sm:` breakpoint): append a `StaticWaveform` to the right side of the row after the listener count, sized ~120×40px
   - On **mobile** (below `sm:`): stack the card vertically — play button + text info on top, then a wider waveform below spanning full width, ~full-width × 48px
   - Use `space.id` as the `seed` prop so each stage gets a unique deterministic waveform pattern
   - Use `white` color with the existing subtle opacity (component default)

### Layout sketch

```text
Desktop/Tablet:
┌─────────────────────────────────────────────────┐
│ [▶]  Title                        🎵🎵🎵🎵🎵🎵 │
│      @host · 2h ago · 👥 3                      │
└─────────────────────────────────────────────────┘

Mobile:
┌──────────────────────────┐
│ [▶]  Title               │
│      @host · 2h ago · 👥 │
│ 🎵🎵🎵🎵🎵🎵🎵🎵🎵🎵🎵🎵│
└──────────────────────────┘
```

