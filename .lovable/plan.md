

## Fix: Reduce Top Space in Bento Cards

**Problem**: The bento containers use `p-3` (12px padding), but the `CardHeader` component inside also has `py-3` (12px vertical padding). This doubles the top spacing to ~24px, while the left side only has 12px.

**Solution**: Remove the top padding from `CardHeader` so the bento wrapper's `p-3` controls all spacing uniformly.

### Change

**`src/components/app/cards/CardHeader.tsx`** (line 102):
- Change `py-3 pr-3` to `pb-3 pr-3` on the outer div
- This removes the CardHeader's own top padding, letting the bento's `p-3` handle it
- Cards outside bentos (e.g., in other contexts) will lose their top padding, but since all feeds now use bentos, this is consistent

This single change fixes the spacing imbalance across all bento cards in every feed.

