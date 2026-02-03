

# Story Editor: Emoji & Text Overlays

## Overview
Add the ability for users to place draggable emoji stickers and text overlays on their recorded story videos before confirming. This will create an editing experience similar to Instagram/TikTok stories.

---

## What You'll Get

### Emoji Stickers
- Tap an emoji button to open an emoji picker (reusing the existing emoji categories)
- Select an emoji and it appears on the video
- Drag emojis anywhere on the screen
- Pinch to resize emojis
- Tap the X on a selected emoji to delete it

### Text Overlays  
- Tap a text button to add text
- Opens a text input with styling options
- Choose from different text styles (bold, outlined, etc.)
- Drag text anywhere on the screen
- Tap on text to edit or delete it

---

## How It Will Look

The preview screen will have a new toolbar at the top with:
- **Emoji button** - Opens the emoji picker
- **Text button** - Opens text input mode

Stickers and text will float on top of the video, with visual handles when selected for repositioning or deletion.

---

## Technical Details

### New Components

**1. StoryOverlayEditor.tsx**
A new component that manages all overlays on the story preview:
- Renders emoji and text elements as draggable overlays
- Handles touch/mouse events for dragging and repositioning
- Manages selection state for editing/deleting overlays

**2. StoryEmojiPicker.tsx**
A fullscreen-friendly emoji picker adapted from the existing EmojiPicker:
- Bottom sheet/drawer style for mobile
- Category tabs (Smileys, Gestures, Hearts, Objects)
- Large touch-friendly emoji buttons

**3. StoryTextInput.tsx**
Text input overlay for adding/editing text:
- Text input field with live preview
- Style buttons (bold, outlined, colored background)
- Color picker for text color
- Done/Cancel buttons

### Data Structure
Each overlay will be stored as an object with:
- Type (emoji or text)
- Content (the emoji character or text string)
- Position (x, y as percentages)
- Scale (for pinch-to-zoom resize)
- Style (for text: color, background, font style)

### Touch Handling
- Single finger drag: Move overlay position
- Pinch gesture: Resize overlay
- Tap on overlay: Select it (show delete button)
- Tap elsewhere: Deselect

### Integration with Story Confirmation
When the user clicks "Confirm":
- Overlays are rendered onto the video using canvas compositing
- The final video blob includes all stickers and text burned in
- Uses similar canvas approach as the existing watermark.ts utility

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/app/stories/StoryOverlayEditor.tsx` | Create | Main overlay management component |
| `src/components/app/stories/StoryEmojiPicker.tsx` | Create | Fullscreen emoji picker for stories |
| `src/components/app/stories/StoryTextInput.tsx` | Create | Text input with styling options |
| `src/components/app/stories/StoryRecorderModal.tsx` | Modify | Add overlay editor to preview screen |
| `src/components/app/stories/index.ts` | Modify | Export new components |
| `src/lib/story-compositor.ts` | Create | Utility to burn overlays into video |

---

## Implementation Phases

**Phase 1: Emoji Stickers**
- Create overlay data structure and state management
- Build draggable emoji rendering
- Create emoji picker adapted for fullscreen
- Add emoji toolbar button to preview screen

**Phase 2: Text Overlays**
- Create text input component with styling
- Add text overlay rendering with drag support
- Integrate text button into toolbar

**Phase 3: Polish & Compositing**
- Implement canvas compositing to burn overlays into final video
- Add delete functionality for selected overlays
- Fine-tune touch handling and visual feedback

