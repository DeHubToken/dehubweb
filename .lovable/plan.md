
# Plan: Fix Profile Bio Not Displaying

## Root Cause

The DeHub API returns the user's bio in the `aboutMe` field, but the `mapUserToProfile` function in `use-dehub-profile.ts` only checks the `bio` field:

```typescript
// Current code (line 78)
bio: user.bio || '',
```

This means if the API returns `{ aboutMe: "My bio text" }` but no `bio` field, the profile bio will be empty.

## Evidence

1. **Update profile uses `aboutMe`** (dehub.ts line 690):
   ```typescript
   formData.append("aboutMe", data.aboutMe);
   ```

2. **Interface defines both fields** (dehub.ts lines 35-36):
   ```typescript
   bio?: string;
   aboutMe?: string | null;
   ```

3. **Mapping only checks `bio`** (use-dehub-profile.ts line 78):
   ```typescript
   bio: user.bio || '',
   ```

## Solution

Update the `mapUserToProfile` function to check both `user.bio` and `user.aboutMe`:

### File: `src/hooks/use-dehub-profile.ts`

**Change line 78 from:**
```typescript
bio: user.bio || '',
```

**To:**
```typescript
bio: user.bio || user.aboutMe || '',
```

This will:
1. First try `user.bio` (for backwards compatibility)
2. Fall back to `user.aboutMe` (the field the API actually uses)
3. Default to empty string if neither exists

## Technical Details

| File | Line | Change |
|------|------|--------|
| `src/hooks/use-dehub-profile.ts` | 78 | Add `user.aboutMe` fallback |

## Expected Result

After this fix, the profile bio will display correctly on the profile page, showing the user's "About Me" text that was saved via the settings page.
