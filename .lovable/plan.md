

# Fix Bio Translate Button Tooltip Styling

## Problem
The `BioTranslateButton` uses the native HTML `title` attribute on its buttons, which renders the default browser tooltip (square, unstyled, black). Our design system explicitly forbids this and requires the custom `Tooltip` component from `@/components/ui/tooltip` for liquid glass styling.

## Changes

### File: `src/components/app/profile/BioTranslateButton.tsx`

1. Import `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip`
2. Remove `title="Show original"` from the reset button and wrap it with the Tooltip component
3. Remove `title="Translate bio"` from the translate button and wrap it with the Tooltip component

### Before (native title):
```
<button title="Translate bio">...</button>
```

### After (liquid glass tooltip):
```
<Tooltip>
  <TooltipTrigger asChild>
    <button>...</button>
  </TooltipTrigger>
  <TooltipContent>Translate bio</TooltipContent>
</Tooltip>
```

Both the translate globe button and the "Show original" reset button will be wrapped with the styled tooltip.

