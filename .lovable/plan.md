Fix the distorted logo in the expanded (full-width) desktop sidebar.

1. Inspect `src/components/app/navigation/DesktopSidebar.tsx` logo rendering for both collapsed and expanded states.
2. Remove conflicting explicit `width={135} height={41}` attributes on the expanded `/dehub-header-logo.png` image (or add `object-contain`) so the logo preserves its natural aspect ratio.
3. Ensure the logo fits the expanded sidebar width without being squeezed or stretched, while keeping the existing layout spacing and burger button placement unchanged.
4. Verify the collapsed compact icon also renders crisply at its current 22px height.
5. Run a quick visual check in the preview to confirm the logo is no longer distorted.