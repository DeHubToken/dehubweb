

# Fix: Text Overlays Not Appearing on Story Video

## Problem Identified

After analyzing the code flow, I found that the text overlay **is being added to state correctly**, but there are several visual issues that could make it invisible:

### Issue 1: Text Visibility on Video
The default text color is white (`#FFFFFF`), and with the "normal" style, it may be hard to see against a bright video. Additionally, the font size (`text-xl` = 20px) is relatively small.

### Issue 2: Outlined Text Style Bug
The outlined text style sets `color: 'transparent'` with only a 1px stroke, which is barely visible:
```tsx
case 'outlined':
  return {
    WebkitTextStroke: `1px ${overlay.style.color}`,
    color: 'transparent',  // Hard to see!
  };
```

### Issue 3: Missing Text Shadow
Unlike emoji overlays that are inherently visible, text needs a shadow or stroke to stand out against any video background.

---

## Solution

### 1. Add Text Shadow for Visibility
Add a drop shadow to all text overlays so they're visible regardless of video background:
```tsx
textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)'
```

### 2. Fix Outlined Style
Increase the stroke width and add a contrasting fill:
```tsx
case 'outlined':
  return {
    WebkitTextStroke: `2px ${overlay.style.color}`,
    color: 'black',  // or a contrasting color
    fontWeight: 700,
  };
```

### 3. Increase Base Font Size
Change from `text-xl` (20px) to `text-2xl` (24px) for better visibility.

### 4. Add Debug Logging (Temporary)
Add a console log in `addText` to confirm the overlay is being added:
```tsx
console.log('Adding text overlay:', newOverlay);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/app/stories/StoryOverlayEditor.tsx` | Update `getTextStyle()` to add shadows; increase font size; fix outlined style |

---

## Updated getTextStyle Function

```tsx
const getTextStyle = (overlay: StoryOverlay): React.CSSProperties => {
  if (!overlay.style) return { textShadow: '0 2px 4px rgba(0,0,0,0.5)' };
  
  // Base shadow for visibility on any background
  const baseShadow = '0 2px 4px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)';
  
  const baseStyle: React.CSSProperties = {
    color: overlay.style.textStyle === 'background' 
      ? (overlay.style.color === '#FFFFFF' ? '#000000' : '#FFFFFF')
      : overlay.style.color,
    textShadow: overlay.style.textStyle !== 'background' ? baseShadow : undefined,
  };

  switch (overlay.style.textStyle) {
    case 'bold':
      return { ...baseStyle, fontWeight: 700 };
    case 'outlined':
      return {
        WebkitTextStroke: `2px ${overlay.style.color}`,
        color: overlay.style.color === '#FFFFFF' ? '#000000' : '#FFFFFF',
        fontWeight: 700,
        textShadow: baseShadow,
      };
    case 'background':
      return {
        ...baseStyle,
        backgroundColor: overlay.style.color,
        padding: '4px 12px',
        borderRadius: '8px',
        textShadow: undefined,
      };
    default:
      return baseStyle;
  }
};
```

## Updated Text Span

```tsx
<span 
  className="text-2xl whitespace-pre-wrap max-w-[80vw] text-center font-semibold"
  style={getTextStyle(overlay)}
>
  {overlay.content}
</span>
```

