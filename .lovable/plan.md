

# Convert Plain White Action Buttons to Liquid Glass Style

## Overview
Replace all solid white (`bg-white text-black`) action buttons across the app with the `LiquidGlassBubble` frosted glass aesthetic. Filter tabs, category pills, and active-state indicators will remain unchanged.

## Approach

Rather than wrapping every button in a `LiquidGlassBubble` div (which would break button semantics and layout), we will create a **reusable CSS class or button variant** that applies the liquid glass visual properties directly to button elements.

### Step 1: Add a `glass` variant to the Button component

Add a new `glass` variant in `src/components/ui/button.tsx` that applies the liquid glass aesthetic:
- Gradient background: `bg-gradient-to-br from-white/20 via-white/10 to-white/5`
- Backdrop blur: `backdrop-blur-xl`
- Border: `border border-white/30`
- Inset shadows for depth
- White text instead of black
- Hover: shimmer/brightening effect

### Step 2: Replace white button styles across ~18 files

Swap `bg-white text-black hover:bg-white/90` (and similar) classes with the new `glass` variant or equivalent liquid glass classes on action buttons in these files:

| File | Button(s) |
|------|-----------|
| `AuthGate.tsx` | Log in |
| `ProfileHeader.tsx` | Follow |
| `ProfilePage.tsx` | Sign Up |
| `BuyCoinsPage.tsx` | Purchase |
| `SettingsPage.tsx` | Apply Changes / Save |
| `ReportModal.tsx` | Submit Report |
| `EditPostModal.tsx` | Save Changes |
| `GoLiveModal.tsx` | Open Stream |
| `CreateTopicRoomModal.tsx` | Create Room |
| `VideoPaywallModal.tsx` | Confirm Purchase |
| `PostAccessToggles.tsx` | Cancel / Confirm PPV |
| `CommentsSection.tsx` | Post comment |
| `StoryCommentsDrawer.tsx` | Send comment |
| `StoryViewerModal.tsx` | Follow |
| `FeaturesPage.tsx` | Submit / Comment |
| `BookmarksPage.tsx` | Try Again |
| `PostContentArea.tsx` | Post button |
| `W2EFeed.tsx` | Earnings badge (minor) |

### What will NOT change
- Active-state pills/tabs in feeds (Videos, Shorts, Radio, Notifications)
- Story text style toggles
- Category filter buttons
- Any conditional `bg-white text-black` used for selected state indicators

## Technical Details

The new `glass` variant will be defined as:
```
glass: "bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] hover:from-white/30 hover:via-white/15 hover:to-white/10"
```

This keeps the button element semantics intact, works with the existing `Button` component API, and matches the `LiquidGlassBubble` visual language.

