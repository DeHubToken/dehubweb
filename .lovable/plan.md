
# Fix: Keep Description Empty When Not Provided

## Problem

When posting, if no description is entered (the optional second field), the system currently defaults to using the full post text as the description. The user wants the description to remain empty/blank when not explicitly filled in.

## Current Behavior

```typescript
// Line 711 in usePostForm.ts
description: description.trim() || text.trim(),
```

If `description` is empty → falls back to `text.trim()`

## Desired Behavior

```typescript
description: description.trim(),
```

If `description` is empty → stays empty

## Change Required

**File:** `src/features/post/hooks/usePostForm.ts`

**Line 711:** Change from:
```typescript
description: description.trim() || text.trim(),
```

To:
```typescript
description: description.trim(),
```

This single-line change ensures that:
- If the user enters a description → it gets sent
- If the user leaves description empty → empty string is sent to the API

## Also Update the Console Log

**Line 695:** Change from:
```typescript
description: description.trim() || text.trim(),
```

To:
```typescript
description: description.trim(),
```

This keeps the debug logging consistent with what's actually sent.

## Summary

| Location | Change |
|----------|--------|
| Line 695 (console.log) | Remove `\|\| text.trim()` fallback |
| Line 711 (mintPost call) | Remove `\|\| text.trim()` fallback |
