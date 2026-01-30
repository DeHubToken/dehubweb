
# Fix Circular Buttons in AI Assistant Page

## Problem Identified

The AI Assistant page has **3 header buttons** (Command Centre, Settings, and Style/Personality selector) that are still using `rounded-full` instead of `rounded-xl`, violating the bento-box UI standard established across the app.

Additionally, there's a custom toggle switch for "Always speak replies" that uses `rounded-full` instead of `rounded-lg` (the standard for toggle switches per the UI guidelines).

## Root Cause

These buttons were likely added or modified after the initial round of UI standardization, or were missed during the comprehensive review.

## Changes Required

### 1. Header Buttons (Lines 1053, 1066, 1077)

Change all three header buttons from `rounded-full` to `rounded-xl`:

| Button | Line | Change |
|--------|------|--------|
| Command Centre toggle | 1053 | `rounded-full` → `rounded-xl` |
| Settings button | 1066 | `rounded-full` → `rounded-xl` |
| Style Selector button | 1077 | `rounded-full` → `rounded-xl` |

### 2. Toggle Switch (Lines 1250, 1255)

Update the custom "Always speak replies" toggle to use `rounded-lg` for both track and thumb:

| Element | Line | Change |
|---------|------|--------|
| Toggle track | 1250 | `rounded-full` → `rounded-lg` |
| Toggle thumb | 1255 | `rounded-full` → `rounded-lg` |

### Elements That Should Remain Unchanged

- **Line 1658**: Small close (X) button on attached image preview - this is a tiny 5x5 badge-style button that can remain circular
- **Line 1870**: Lock icon container in PIN modal - this is a decorative icon container, not an interactive button

## Visual Reference

Before:
```
[●Command Centre] [●Settings] [●Normal ▾]
```

After:
```
[▢Command Centre] [▢Settings] [▢Normal ▾]
```

## File to Modify

`src/pages/app/AssistantPage.tsx` - 5 line changes total

## Technical Details

The changes are straightforward class name replacements:

```tsx
// Line 1053: Command Centre button
- className={`rounded-full border-white/20 ...`}
+ className={`rounded-xl border-white/20 ...`}

// Line 1066: Settings button
- className="rounded-full border-white/20 ..."
+ className="rounded-xl border-white/20 ..."

// Line 1077: Style Selector button
- className="rounded-full border-white/20 ..."
+ className="rounded-xl border-white/20 ..."

// Line 1250: Toggle track
- className={`relative w-11 h-6 rounded-full ...`}
+ className={`relative w-11 h-6 rounded-lg ...`}

// Line 1255: Toggle thumb
- className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full ...`}
+ className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-lg ...`}
```
