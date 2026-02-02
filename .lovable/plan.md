
# Post Title/Description Logic Update

## Summary
Update the posting flow so that video posts extract the first line as the title and remaining lines as the description, while image and text posts keep the title blank and send all content as description.

## Current Behavior
- `name` field is populated with the first 100 characters of the text content
- `description` is a separate optional field the user can toggle

## New Logic

### Video Posts
1. Split the text content by newlines
2. **First line** → sent as `name` (title)
3. **Second line + remaining lines** → joined and sent as `description`
4. If only one line exists, use it as title with empty description

### Image & Text Posts
1. **Title/Name** → always empty string `""`
2. **Description** → entire text content (all lines)

## Technical Changes

### File: `src/features/post/hooks/usePostForm.ts`

**Location**: Inside `handlePost` function (around line 714-716)

**Current code:**
```typescript
const mintResponse = await mintPost({
  name: text.trim().slice(0, 100) || 'Untitled',
  description: description.trim(),
  // ...
});
```

**New code:**
```typescript
// Determine title and description based on post type
let postTitle = '';
let postDescription = '';

if (postType === 'video') {
  // Video: first line = title, rest = description
  const lines = text.trim().split('\n');
  postTitle = (lines[0] || '').trim().slice(0, 100) || 'Untitled';
  postDescription = lines.slice(1).join('\n').trim();
} else {
  // Image/Text posts: title blank, everything goes to description
  postTitle = '';
  postDescription = text.trim();
}

const mintResponse = await mintPost({
  name: postTitle,
  description: postDescription,
  // ...
});
```

## Additional Cleanup

The separate `description` field and "Show Description" toggle in the UI can be kept for backwards compatibility (users might still want to add a separate description), but the new logic will take precedence:

- For videos: if user uses the description field, it will be appended to the auto-extracted description
- For images/text: the description field content will be appended after the main text

**OR** we can simplify and remove the separate description field entirely since:
- Videos get description from 2nd line onwards
- Images/text get description from the entire text

I recommend keeping the current flow but updating the API call logic only - this is the minimal change.

## Files Modified
- `src/features/post/hooks/usePostForm.ts` - Update `handlePost` to implement new title/description extraction logic

## Impact
- No UI changes required
- Existing posts unaffected
- Only affects new posts going forward
