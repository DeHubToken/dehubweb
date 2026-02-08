

# Fix Story Views: Every Click = 1 View

## Root Cause

Two issues are preventing views from being recorded:

1. **Database type mismatch**: The `story_views.story_id` column is type `uuid` with a foreign key to `stories(id)`. Template stories use IDs like `template-1`, `template-13` -- these aren't valid UUIDs, so every INSERT and SELECT query fails with `invalid input syntax for type uuid: "template-1"`.

2. **Deduplication prevents repeat views**: There's a `UNIQUE(story_id, viewer_wallet_address)` constraint plus upsert logic plus a frontend `recordedViews` ref that all prevent the same user from being counted more than once per session.

## Solution

Make views dead simple: **every click = 1 new row, no auth, no deduplication**.

### 1. Database Migration

- Change `story_id` from `uuid` to `text` (drop the FK constraint to `stories` and the unique constraint first)
- Remove the `UNIQUE(story_id, viewer_wallet_address)` constraint so repeat views are allowed
- Keep `viewer_wallet_address` as optional context but don't use it for dedup

```text
Before: story_views(id uuid PK, story_id uuid FK -> stories, viewer_wallet_address text, viewed_at timestamptz)
         + UNIQUE(story_id, viewer_wallet_address)

After:  story_views(id uuid PK, story_id text, viewer_wallet_address text, viewed_at timestamptz)
         (no FK, no unique constraint)
```

### 2. Edge Function (`supabase/functions/stories-api/index.ts`)

**GET /views** (lines 58-78):
- Keep as-is (count query works fine once the type is text)
- Keep the 7x multiplier

**POST /views** (lines 80-110):
- Change from `upsert` with `onConflict` to a plain `INSERT` -- every call = 1 new row
- Keep the anonymous viewer ID generation (good for analytics context)
- No duplicate checking at all

### 3. Frontend Hook (`src/hooks/use-story-views.ts`)

- Remove the `recordedViews` ref and per-session dedup -- every time `recordView()` is called, it fires the POST
- Remove `useAuth` import since no auth is needed
- Keep the wallet address header as optional (nice-to-have analytics)
- Keep the memory cache and React Query cache for display purposes

## Files Changed

| File | Change |
|------|--------|
| Database migration | Drop FK, drop UNIQUE, alter `story_id` from `uuid` to `text` |
| `supabase/functions/stories-api/index.ts` | Change `upsert` to plain `INSERT` on POST /views |
| `src/hooks/use-story-views.ts` | Remove `recordedViews` session dedup so every call fires |

## Expected Result

- Clicking on any story (including template stories) immediately records a view
- View count increments on every click/open (x7 multiplier still applies)
- No auth required, no login needed
- No more 500 errors from UUID type mismatch

