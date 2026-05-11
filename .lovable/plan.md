# Fix "NaN DHB" on @aaron's post

## What's happening

Aaron's latest post is a gated/locked post, so the card renders a "Must be holding X DHB" (or "Unlock for X DHB") label. The price comes from `post.lockedPrice` / `post.ppvPrice`, which is `undefined` or non-numeric on this post.

The label is built with:

```ts
formatCompact(Number(post.lockedPrice))
```

`Number(undefined)` is `NaN`, and the helper in `ImageCard.tsx` / `VideoCard.tsx` is:

```ts
const formatCompact = (num: number): string => {
  if (num >= 1000000) return `${Math.floor(num / 1000000)}M`;
  if (num >= 1000) return `${Math.floor(num / 1000)}K`;
  return String(num);              // → "NaN"
};
```

So the user sees `NaN DHB`.

## Fix

Make `formatCompact` resilient and don't render the gating label at all when there's no real price.

1. **`src/components/app/cards/ImageCard.tsx`** and **`src/components/app/cards/VideoCard.tsx`**
   - Update `formatCompact` to coerce safely: if `num` is `null`/`undefined`/`NaN` or `<= 0`, return `'0'`.
   - Wrap every `Unlock for …` / `Must be holding …` JSX so it only renders when the underlying price is a finite positive number. If price is missing, fall back to a generic label (e.g. "Locked post") or hide the price portion entirely so we never print "0 DHB" or "NaN DHB".

2. No backend / data-shape changes — purely presentational guards in the two card components.

## Verification

- Reload the home feed, locate Aaron's post, confirm the badge no longer shows "NaN DHB".
- Quick visual pass on other gated posts (PPV + locked + bounty variants) to make sure formatting still looks right for real numeric values.
