
# Investigation: Text Overlays Not Appearing on Story Video

## Root Cause Analysis

After extensive code review, I've traced the complete flow and identified **the actual root cause**:

### The Problem

Looking at the `StoryTextInput` component and how it passes data back:

```tsx
// StoryTextInput.tsx - handleSubmit
const handleSubmit = () => {
  if (text.trim()) {
    onTextSubmit(text.trim(), {
      color: textColor,
      backgroundColor: textStyle === 'background' ? textColor : undefined,
      textStyle,
    });
  }
  onClose();  // Closes immediately after submit
};
```

The flow is:
1. User clicks Text button → `showTextInput = true`
2. User types text and clicks Done → `handleSubmit()` runs
3. `onTextSubmit()` calls `handleEditText()` → `addText()`
4. `addText()` calls `onOverlaysChange([...overlays, newOverlay])`
5. `onClose()` runs, setting `showTextInput = false`

The state update in `addText` uses the `overlays` value from when the callback was created. Due to React's state batching and how `useCallback` captures the `overlays` array, there might be a **stale closure issue**.

### Why This Happens

The `addText` function has `overlays` in its dependency array:

```tsx
const addText = useCallback((text: string, style: {...}) => {
  // ...
  onOverlaysChange([...overlays, newOverlay]);  // Uses captured 'overlays'
}, [overlays, onOverlaysChange]);  // Re-created when overlays changes
```

When `StoryTextInput` is open for an extended period, the `handleEditText` function passed to it still references an older version of `addText` that has `overlays = []`.

### Solution

Use the **functional update pattern** for state updates to ensure we always get the latest state:

```tsx
const addText = useCallback((text: string, style: {...}) => {
  const newOverlay: StoryOverlay = {
    id: generateId(),
    type: 'text',
    content: text,
    x: 50,
    y: 50,
    scale: 1,
    rotation: 0,
    style,
  };
  // Use functional update to avoid stale closure
  onOverlaysChange(prev => [...prev, newOverlay]);
  setSelectedId(newOverlay.id);
}, [onOverlaysChange]);  // Remove 'overlays' from dependencies
```

Wait - but `onOverlaysChange` is just `setOverlays` from the parent, which doesn't support functional updates in this pattern.

**Alternative solution:** We need to ensure fresh callbacks by either:
1. Restructuring the callback chain
2. Using a ref to always access the latest overlays
3. Adding console logging first to verify the issue

---

## Proposed Fix

### Step 1: Add Debug Logging (to confirm the issue)

Add `console.log` statements to trace the flow:

```tsx
// In addText
console.log('[StoryOverlay] addText called with:', text);
console.log('[StoryOverlay] Current overlays:', overlays);
console.log('[StoryOverlay] New overlay:', newOverlay);
```

### Step 2: Use Ref for Latest Overlays

Use a ref to always access the current overlays value:

```tsx
const overlaysRef = useRef(overlays);
overlaysRef.current = overlays;

const addText = useCallback((text: string, style: {...}) => {
  const newOverlay = {...};
  onOverlaysChange([...overlaysRef.current, newOverlay]);
  setSelectedId(newOverlay.id);
}, [onOverlaysChange]);  // No dependency on 'overlays'
```

### Step 3: Also Update Parent State Handler

In `StoryRecorderModal.tsx`, change to functional updates:

```tsx
// Instead of passing setOverlays directly:
onOverlaysChange={(newOverlays) => setOverlays(newOverlays)}

// Could also update to use functional pattern if needed
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/app/stories/StoryOverlayEditor.tsx` | Add `overlaysRef`, update `addText`, `addEmoji`, `updateOverlay`, `deleteOverlay` to use ref; Add debug logging |

---

## Technical Implementation

### Updated StoryOverlayEditor.tsx

```tsx
// Add near the top of the component, after the state declarations:
const overlaysRef = useRef(overlays);
overlaysRef.current = overlays;

// Update addEmoji to use ref:
const addEmoji = useCallback((emoji: string) => {
  const newOverlay: StoryOverlay = {
    id: generateId(),
    type: 'emoji',
    content: emoji,
    x: 50,
    y: 50,
    scale: 1,
    rotation: 0,
  };
  console.log('[StoryOverlay] Adding emoji overlay:', newOverlay);
  onOverlaysChange([...overlaysRef.current, newOverlay]);
  setSelectedId(newOverlay.id);
}, [onOverlaysChange]);

// Update addText to use ref:
const addText = useCallback((text: string, style: { color: string; backgroundColor?: string; textStyle: TextStyle }) => {
  const newOverlay: StoryOverlay = {
    id: generateId(),
    type: 'text',
    content: text,
    x: 50,
    y: 50,
    scale: 1,
    rotation: 0,
    style,
  };
  console.log('[StoryOverlay] Adding text overlay:', newOverlay);
  console.log('[StoryOverlay] Current overlays:', overlaysRef.current);
  onOverlaysChange([...overlaysRef.current, newOverlay]);
  setSelectedId(newOverlay.id);
}, [onOverlaysChange]);

// Update updateOverlay to use ref:
const updateOverlay = useCallback((id: string, updates: Partial<StoryOverlay>) => {
  onOverlaysChange(overlaysRef.current.map((o) => (o.id === id ? { ...o, ...updates } : o)));
}, [onOverlaysChange]);

// Update deleteOverlay to use ref:
const deleteOverlay = useCallback((id: string) => {
  onOverlaysChange(overlaysRef.current.filter((o) => o.id !== id));
  setSelectedId(null);
}, [onOverlaysChange]);
```

This ensures that all callback functions always access the **latest** value of `overlays` via the ref, eliminating any stale closure issues.
