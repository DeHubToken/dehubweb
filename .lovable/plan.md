In `src/components/DocsLayout.tsx`, the active nav items use `border-l-4 border-primary ml-0` which renders the left side line.

**Change:** Remove `border-l-4 border-primary ml-0` from both active-state class strings (lines 320 and 340). Keep `bg-muted text-foreground font-medium` so the active item stays highlighted via background + bolder text only.

No other files affected.