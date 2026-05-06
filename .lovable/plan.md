# Fix the double preloader at the source

## What is actually wrong
The issue is not only the feed logic — the raw boot HTML in `index.html` currently contains the app shell markup twice. I verified the duplicated markers in the body:
- `.bs-left-logo` appears **2 times**
- `.bs-center` appears **2 times**
- `.bs-right` appears **2 times**

That means the page is literally painting duplicated preloader structure before React finishes mounting.

## Plan

1. **Clean `index.html` so the boot shell exists only once**
   - Remove the accidental duplicated shell markup from the body.
   - Keep only one banner and one boot skeleton tree inside `#root`.
   - Preserve the current first-paint structure and styling.

2. **Audit the handoff between boot HTML and React home feed**
   - Re-check the temporary home boot overlay logic added in `AppLayout.tsx`.
   - Keep only the minimum gating needed so the single boot shell stays visible until the real feed is ready.
   - If the duplicate HTML was the main cause, simplify any extra guard that now creates unnecessary layering.

3. **Verify there is only one loading phase left**
   - Recount the boot DOM markers after cleanup.
   - Reload `/app` in preview and confirm the shell appears once, then swaps once into feed content.
   - Validate there is no second feed skeleton appearing after the shell.

## Files to touch
- `index.html`
- `src/components/app/AppLayout.tsx`
- `src/components/app/feeds/HomeFeed.tsx`

## Expected result
- One red announcement banner
- One boot shell
- One handoff into the actual home feed
- No second visible preloader phase