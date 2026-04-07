

## Fix: Submit button unreachable when image is attached in Feature Request drawer

### Problem
The `SubmitFeatureDrawer` content area (`div.px-4.pb-6.space-y-4` at line 582) has no scroll capability. When a user attaches an image/video preview (~192px tall), the total content exceeds the `max-h-[85vh]` of the drawer, pushing the Submit button off-screen with no way to scroll to it.

### Solution
Add `overflow-y-auto` to the content div so it scrolls when content exceeds available space. Also add `overscroll-contain` to prevent scroll chaining.

### File to change

| File | Change |
|------|--------|
| `src/pages/app/FeaturesPage.tsx` | Line 582: Change `<div className="px-4 pb-6 space-y-4">` to `<div className="px-4 pb-6 space-y-4 overflow-y-auto overscroll-contain flex-1">` |

This is a one-line CSS fix — the content div becomes scrollable within the drawer's max height, ensuring the submit button is always reachable.

