

# Add Progress Bar to QuotePostModal

## What
Add the same LiquidGlassBubble progress bar with creep logic (69%→99%) to the QuotePostModal, matching the normal post system's publishing UX.

## Changes — single file: `src/components/app/modals/QuotePostModal.tsx`

1. **Add `uploadProgress` state** (starts at 0)
2. **Update `handleSubmit`**:
   - Set progress to 65% before on-chain mint
   - Start the same creep interval (69→99%, exponential deceleration, 1200ms tick)
   - Set to 100% on success, clear interval on success/error
3. **Render progress bar** between the compose area and the character count, visible when `isSubmitting && uploadProgress > 0`:
   - Same `LiquidGlassBubble` wrapper with label ("Publishing..." since quote posts have no upload phase) and percentage
   - Same glass-styled `h-2` bar with shimmer animation
   - Copied directly from `PostActionBar.tsx` lines 200-230
4. **Import** `LiquidGlassBubble` from `@/components/ui/liquid-glass-bubble`

No other files need changes.

