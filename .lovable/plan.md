

# Fix: Line breaks destroyed when posting text with links

## Problem

When you type text, press Enter to create a new line, then paste a URL, the line break gets stripped out. The posted content shows the text and URL stuck together with no space.

**Root cause** — Line 1017 in `usePostForm.ts`:

```typescript
const cleanDescription = postDescription.replace(hashtagRegex, '').replace(/\s{2,}/g, ' ').trim();
const cleanTitle = postTitle.replace(hashtagRegex, '').replace(/\s{2,}/g, ' ').trim() || postTitle;
```

The regex `/\s{2,}/g` matches **any whitespace character** 2 or more times — including `\n`, `\n\n`, `\r\n`, etc. — and replaces them all with a single space. This collapses all line breaks into spaces.

## Fix

Replace the aggressive whitespace collapse with one that only collapses **consecutive spaces** on the same line, preserving newlines:

- `cleanDescription`: Replace `/\s{2,}/g` with `/[^\S\n]{2,}/g` (collapses multiple spaces/tabs but keeps newlines intact). Then also normalize more than 2 consecutive blank lines down to 2 with `/\n{3,}/g` → `\n\n`.
- `cleanTitle`: Same treatment.

This is a **2-line change** in `src/features/post/hooks/usePostForm.ts`.

