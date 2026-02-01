
# Fix: Preserve Line Breaks in Posts

## Problem Summary

When users enter line breaks in the post modal (by pressing Enter), those line breaks are not preserved in the final post display. The text appears as a single paragraph.

## Root Cause Analysis

Two issues cause this problem:

### Issue 1: Line Breaks Not Captured During Input

The `handleInput` function in `PostContentArea.tsx` uses a TreeWalker to extract plain text:

```typescript
while (walker.nextNode()) {
  const node = walker.currentNode;
  if (node.nodeType === Node.TEXT_NODE) {
    plainText += node.textContent;  // Only captures text nodes
  }
  // ...
}
```

When users press Enter in a `contentEditable` div, browsers insert `<br>` elements or wrap text in `<div>` elements. The TreeWalker ignores these, so line breaks are lost.

### Issue 2: Line Breaks Not Rendered in PostCard

Even if line breaks were captured as `\n` characters, the `TranslatableText` component renders without CSS whitespace handling:

```tsx
// PostCard.tsx line 124
<TranslatableText text={post.content} className="text-white/90 text-sm sm:text-base" as="p" />

// TranslatableText.tsx line 294-295
<Component className={className}>
  {isTranslated ? translatedText : text}
</Component>
```

Without `whitespace-pre-wrap`, newline characters render as spaces.

## Solution

### Change 1: Capture Line Breaks in Input Handler

Update the `handleInput` function to detect `<br>` elements and block-level elements (`<div>`, `<p>`) and convert them to newline characters:

```
File: src/features/post/components/PostContentArea.tsx

Current TreeWalker logic:
- Only captures text nodes
- Ignores structural elements

Updated logic:
- Check for BR elements and append '\n'
- Check for DIV/P elements and append '\n' before their content
- Handle edge cases (first element, consecutive breaks)
```

### Change 2: Render with Preserved Whitespace

Update the `TranslatableText` component to include `whitespace-pre-wrap` in its styling:

```
File: src/components/app/TranslatableText.tsx

Add to the wrapper element:
- className that includes "whitespace-pre-wrap"
- This ensures \n characters render as line breaks
```

## Implementation Details

### File 1: `src/features/post/components/PostContentArea.tsx`

Update the `handleInput` function (around lines 278-311):

```typescript
const handleInput = useCallback((e?: React.FormEvent<HTMLDivElement>) => {
  const editor = e?.currentTarget || editorRef.current;
  if (!editor) return;
  
  // Get plain text including URLs from chips and preserving line breaks
  let plainText = '';
  
  const processNode = (node: Node, isFirst: boolean = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      plainText += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toUpperCase();
      
      // Handle link chips specially
      if (el.hasAttribute('data-link-chip')) {
        plainText += el.getAttribute('data-url') || '';
        return;
      }
      
      // BR elements become newlines
      if (tagName === 'BR') {
        plainText += '\n';
        return;
      }
      
      // Block elements (DIV, P) add newline before (except first)
      const isBlock = tagName === 'DIV' || tagName === 'P';
      if (isBlock && !isFirst && plainText.length > 0 && !plainText.endsWith('\n')) {
        plainText += '\n';
      }
      
      // Process children
      let first = true;
      for (const child of el.childNodes) {
        processNode(child, first && isFirst);
        first = false;
      }
    }
  };
  
  // Process all children of editor
  let first = true;
  for (const child of editor.childNodes) {
    processNode(child, first);
    first = false;
  }
  
  setText(plainText);
  
  // Trigger mention detection
  mention.handleInput(plainText);
  
  // Process links after a short delay (debounce)
  setTimeout(processLinks, 300);
}, [editorRef, setText, processLinks, mention]);
```

### File 2: `src/components/app/TranslatableText.tsx`

Update the rendering to preserve whitespace (around line 294):

```typescript
// Before (line 284-301):
return (
  <>
    <AnimatePresence mode="wait">
      <motion.div
        key={isTranslated ? 'translated' : 'original'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <Component className={className}>
          {isTranslated ? translatedText : text}
        </Component>
      </motion.div>
    </AnimatePresence>
    {renderTranslateControl()}
  </>
);

// After:
return (
  <>
    <AnimatePresence mode="wait">
      <motion.div
        key={isTranslated ? 'translated' : 'original'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <Component className={cn("whitespace-pre-wrap", className)}>
          {isTranslated ? translatedText : text}
        </Component>
      </motion.div>
    </AnimatePresence>
    {renderTranslateControl()}
  </>
);
```

Also update the simple render case (around line 224):

```typescript
// Before:
if (!shouldOfferTranslation && !isDetecting) {
  return <Component className={className}>{text}</Component>;
}

// After:
if (!shouldOfferTranslation && !isDetecting) {
  return <Component className={cn("whitespace-pre-wrap", className)}>{text}</Component>;
}
```

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `PostContentArea.tsx` | Update `handleInput` to detect BR/DIV/P elements | Capture line breaks as `\n` in text state |
| `TranslatableText.tsx` | Add `whitespace-pre-wrap` to className | Render `\n` as visible line breaks |

## Testing Recommendations

1. Create a post with multiple paragraphs (press Enter twice between them)
2. Verify the line breaks appear in the preview
3. Post and verify line breaks persist in the final displayed post
4. Test with translated text to ensure line breaks are preserved after translation
5. Test on mobile to ensure the touch keyboard Enter key works correctly
