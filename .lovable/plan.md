

## Move "Buy [Token]" Button Next to Balance (Left Side)

**Current layout (line 284-296):**
```text
Balance: 0.0023 ETH (insufficient)          + Buy ETH
```

**Proposed layout:**
```text
Balance: 0.0023 ETH (insufficient)  + Buy ETH
```

### Change
In `src/components/app/SwapToTokenDrawer.tsx` (lines 284-296), restructure the flex row so the "Buy" button sits immediately after the balance text on the left instead of being pushed to the right with `justify-between`. Both elements will be grouped on the left using a `gap-2` flex container, removing the `justify-between` from that row.

