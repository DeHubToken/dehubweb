

## Problem: `build.target: 'esnext'` breaks older Safari/iOS

Vite's `build.target` controls which JavaScript features are kept as-is vs transpiled down. `esnext` means "emit whatever the latest spec allows" — no transpilation. Older iPhones running iOS 14 or 15 (Safari 14/15) choke on syntax they don't understand, producing a white screen with no error visible to the user.

### Affected devices
- iPhone 6s / 7 / 8 / SE (1st & 2nd gen) on iOS 14–15
- Any iPhone where the user hasn't updated past iOS 15
- Safari 14–15 on macOS

### Plan

**1. Change the Vite build target** (`vite.config.ts`)

Replace `target: 'esnext'` with a target that covers Safari 14+:

```
target: ['es2020', 'safari14']
```

This tells Vite/esbuild to transpile syntax newer than ES2020 (like top-level await, class static blocks, etc.) down to something Safari 14 can run. This covers iPhones back to iOS 14.

If you only need to support iOS 15+, use `safari15` instead — it's slightly less transpilation.

**2. Add the `browserslist` field to `package.json`** (optional but recommended)

This helps other tools (Tailwind, PostCSS, autoprefixer) know your browser support:

```json
"browserslist": ["iOS >= 14", "safari >= 14", "> 0.5%", "not dead"]
```

**3. Check for unsupported API usage** (audit, no file changes)

Even with syntax transpiled, some runtime APIs don't exist on older Safari:
- `structuredClone` — not available until Safari 15.4
- `crypto.randomUUID` — Safari 15.4+
- `Array.prototype.at()` — Safari 15.4+
- `AbortSignal.timeout()` — Safari 16+

If any of these are used, they need polyfills or fallbacks. I'll search the codebase for usage after implementation begins.

### Impact
- No visual or functional changes on modern devices
- Bundle size increases very slightly (a few KB) from transpiled syntax
- Older iPhones will be able to load and use the site

