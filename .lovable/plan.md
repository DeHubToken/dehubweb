

## Problem

The `index.html` sets the favicon via a remote Google Storage URL:
```html
<link rel="icon" type="image/png" href="https://storage.googleapis.com/...ftv logo (3).png">
```

SafePal browser (and some other in-app browsers) ignore this and instead fetch the standard `/favicon.ico` from the root. The file at `public/favicon.ico` is the default Lovable icon.

## Fix

1. **Replace `public/favicon.ico`** with the DeHub icon (the same logo used in the remote URL, converted to `.ico` format or just use a `.png` and reference it).

2. **Add additional favicon tags** to `index.html` for broader browser compatibility:
   - `apple-touch-icon` (for iOS/Safari home screen)
   - A `manifest.json` with icon entries (for PWA / in-app browsers)
   - Multiple sizes (16x16, 32x32, 192x192) for different contexts

3. **Use a local favicon file** instead of the remote URL — download/copy the DeHub logo into `public/` and reference it locally. This is more reliable across all browsers.

## Changes

| File | Change |
|------|--------|
| `public/favicon.ico` | Replace with DeHub logo `.ico` file |
| `public/dehub-icon-192.png` | Add 192x192 icon for manifest/touch |
| `index.html` | Add `apple-touch-icon`, update favicon to local path, add `manifest.json` link |
| `public/manifest.json` | Create with proper icon entries |

