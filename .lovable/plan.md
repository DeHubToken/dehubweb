
# Fix Color Hue Slider - Keep Left Side Lit Up

## Problem
The color/hue slider in the fullscreen visualizer dims out the left portion when dragging to the right. You want the left side (the selected range) to stay lit up and only the unselected portion on the right to dim out.

## Solution
Add a semi-transparent overlay on the right side of the thumb (the unselected portion) to create a "dimming" effect, while keeping the left side (selected portion) fully visible with the rainbow gradient.

## Implementation

**File: `src/components/app/radio/RadioFullscreenVisualizer.tsx`**

Update the hue slider section to add a dark overlay that covers only the unselected (right) portion:

1. Wrap the slider in a relative container
2. Add a pseudo-overlay div that covers from the current thumb position to the right edge
3. The overlay will have a dark semi-transparent background to "dim" the unselected portion
4. The left side remains fully vibrant showing the selected range

### Technical Details
- Calculate the percentage position based on current `hue` value (0-360 maps to 0-100%)
- Position an absolutely-placed dark overlay from that percentage to 100%
- This creates the visual effect of the left side being "lit up" and the right side being "dimmed"
