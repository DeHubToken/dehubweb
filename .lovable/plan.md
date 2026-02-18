

# Liquid Glass Styling for Wallet Connect Modal + Build Fix

## Overview
The "Connect Wallet" modal is rendered by the Reown AppKit SDK. It supports theming via `themeVariables` CSS custom properties and global CSS targeting its shadow DOM. We can make it match the liquid glass aesthetic by combining both approaches.

## Build Error Fix
There's also a build error in `src/lib/web3auth.ts` where `modalZIndex: 99999` is typed as a number but expects a string. This will be fixed to `modalZIndex: "99999"`.

## Changes

### 1. Fix build error in `src/lib/web3auth.ts`
- Change `modalZIndex: 99999` to `modalZIndex: "99999"`

### 2. Update AppKit theme variables in `src/lib/wagmi.ts`
- Set `--w3m-color-mix` to a dark transparent tone for blending
- Set `--w3m-color-mix-strength` to control the glass-like tinting
- Keep accent white to match the liquid glass button standard

### 3. Add global CSS overrides in `src/index.css`
Target the AppKit modal's shadow DOM parts with liquid glass styling:
- Frosted glass background (`backdrop-blur`, semi-transparent bg)
- Subtle white borders matching `border-white/[0.08]`
- Rounded corners consistent with the app's `rounded-xl` standard
- Remove any solid dark backgrounds in favor of translucent ones

The CSS will target `w3m-modal` and its internal parts using `::part()` selectors and CSS custom properties that AppKit exposes, giving the modal the same frosted glass look as the rest of the app.

## Technical Details
- AppKit renders inside a Web Component with shadow DOM, so normal CSS selectors won't reach internal elements
- The `themeVariables` config is the primary customization mechanism
- Additional global CSS using `w3m-modal` element selectors can override the outer shell
- The `--w3m-color-mix` variable blends a color into the modal's default palette, which we'll use for the translucent glass effect

