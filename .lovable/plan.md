
# Smart Title/Description Parsing for Posts

## Overview
Update the posting system to properly parse user input into separate `name` (title) and `description` fields that the DeHub API expects, with logic that adapts based on content type and line count.

## Updated Requirements

| Post Type | Lines | Title | Description |
|-----------|-------|-------|-------------|
| Video | 1 line | First line | Empty |
| Video | Multi-line | First line | Lines 2+ |
| Feed/Image | 1 line | First line | **Empty** |
| Feed/Image | Multi-line | First line | Lines 2+ |

The key change: Multi-line posts (of any type) now keep the description populated with lines 2+. Only single-line posts have an empty description.

## Technical Changes

### File: `src/features/post/hooks/usePostForm.ts`

**Location**: Around lines 684-710 (in the `handlePost` function)

Replace the current title/description logic:
```typescript
// BEFORE (current)
name: text.trim().slice(0, 100) || 'Untitled',
description: description.trim() || text.trim(),

// AFTER (new parsing logic)
// Parse title and description from text content
const textContent = text.trim();
const lines = textContent.split('\n').filter(line => line.trim());
const firstLine = lines[0]?.trim() || '';

// Title is always the first line (max 100 chars)
const postTitle = firstLine.slice(0, 100) || 'Untitled';

// Description: use lines 2+ if multi-line, otherwise blank
const postDescription = lines.length > 1 
  ? lines.slice(1).map(l => l.trim()).join('\n') 
  : '';
```

Then update the `mintPost` call:
```typescript
const mintResponse = await mintPost({
  name: postTitle,
  description: postDescription,
  // ... rest unchanged
});
```

Also update the console.log statement for debugging consistency.

## Summary of Changes

| Change | Description |
|--------|-------------|
| Parse logic | Split text by newlines, first line = title, rest = description |
| Single-line behavior | Description is blank (for all post types) |
| Multi-line behavior | Lines 2+ become description (for all post types) |
| Edge cases | Empty content falls back to "Untitled" title |

## Files to Modify

- `src/features/post/hooks/usePostForm.ts` - Update title/description parsing in `handlePost`
