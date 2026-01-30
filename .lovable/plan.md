
# Modernize CommentsSection Tab Switcher

## Overview
The home page videos and images use a different comment component (`CommentsSection.tsx`) than the one I've been updating (`CommentsSheet.tsx`). This plan will update `CommentsSection` to match the icon-only tab switcher design you showed.

## Changes Required

### 1. Update Tab Switcher in CommentsSection.tsx
Replace the current shadcn `Tabs` component with a custom icon-only tab bar matching the side panel style:

**Current (lines ~298-304):**
- Uses `<Tabs>`, `<TabsList>`, `<TabsTrigger>` components
- Has text labels "Replies" and "Quotes"

**New Design:**
- Remove shadcn Tabs dependency for the switcher
- Two equal-width buttons with icons only (MessageCircle + Repeat2)
- Active state: gradient background from `zinc-800/60` to transparent
- Icon size: `w-5 h-5`
- No text labels, no bottom border
- Matches exactly what's in the screenshot

### 2. Add Padding to Comments
- Increase horizontal padding in the comment items for better spacing
- Ensure avatars and bookmarks aren't stuck to edges

## Technical Details

**File: `src/components/app/cards/CommentsSection.tsx`**

- Remove `Tabs, TabsList, TabsTrigger, TabsContent` from shadcn imports
- Add `MessageCircle, Repeat2` icons (already imported)
- Replace the entire `<Tabs>` block with custom button-based tab bar
- Use the same `activeTab` state pattern already in the file (line 297)
- Render content conditionally based on `activeTab` instead of using `TabsContent`
- Update comment item padding from `py-3` to include `px-5`

The styling will exactly match:
```
flex container with two flex-1 buttons
└── Button 1: MessageCircle icon (replies)
    └── Active: gradient overlay + white icon
    └── Inactive: zinc-500 icon, hover zinc-300 with bg-zinc-800/30
└── Button 2: Repeat2 icon (quotes)
    └── Same active/inactive states
```
