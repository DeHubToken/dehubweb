

## Problem Analysis

The profile picture upload appears to complete (toast shows "Profile updated") but the avatar doesn't visually change. Two issues at play:

1. **Input not reset after save**: After `onSuccess`, `avatarFile` is set to `undefined` and `avatarPreview` is cleared, but the `<input type="file">` element retains its previous value. If the user picks the same file again, the browser's `onChange` won't fire (same file = no change event). This isn't the primary issue though.

2. **`avatarPreview` not cleared properly after save, then overwritten by `refreshUser`/`getAccountInfo`**: After the save succeeds:
   - The optimistic update sets the blob URL into the `dehub-profile` query cache
   - Then `refreshUser()` and `getAccountInfo()` are called, which fetch the **old** CDN avatar URL (CDN hasn't propagated yet)
   - `queryClient.invalidateQueries({ queryKey: ['dehub-profile'] })` at line 425 triggers a refetch that **overwrites** the optimistic blob URL with the stale CDN URL
   - The avatar visually reverts to the old image

3. **`avatarPreview` is reset to `undefined`** at line 396 (`setAvatarFile(undefined)`) — but `avatarPreview` is never explicitly cleared. However, the `AvatarImage` at line 574 uses `avatarPreview` which still holds the blob URL. The real display issue is everywhere else in the app (navbar, profile page, etc.) where the stale CDN URL from the API response overwrites the optimistic update.

## Plan

### 1. Reset file input after save
In the `onSuccess` handler, reset the file input element value so re-selecting the same file triggers `onChange`:
```typescript
if (avatarInputRef.current) avatarInputRef.current.value = '';
if (coverInputRef.current) coverInputRef.current.value = '';
```

### 2. Preserve optimistic avatar URL during post-save refresh
The issue is that `queryClient.invalidateQueries({ queryKey: ['dehub-profile'] })` on line 425 fires a refetch that returns the old CDN URL before it propagates. Fix by:
- Moving the optimistic cache update **after** the `refreshUser` + `getAccountInfo` calls
- Or: setting the optimistic blob URL again after the refetch, by using `setQueriesData` after the `invalidateQueries` call
- Simplest approach: delay the `invalidateQueries` for `dehub-profile` by a few seconds (e.g., 10s) to give CDN time to propagate, while keeping the blob preview in cache immediately

### 3. Keep `avatarPreview` state alive after save
Don't clear `avatarPreview` in `onSuccess` — let the blob URL persist as the displayed avatar until the next page load or cache refresh brings the real CDN URL. Currently `avatarPreview` is not explicitly cleared, but the `dehub-profile` cache invalidation overwrites it in components that read from the query cache.

### Files to modify
- **`src/pages/app/SettingsPage.tsx`**: 
  - Reset input refs after save
  - Re-apply optimistic blob URL after the refetch/invalidation, or delay invalidation for profile queries when avatar/cover changed

