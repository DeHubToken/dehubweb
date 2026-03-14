

# Maldoteth Profile Showing 0 Followers/Following

## Root Cause

The profile cache seeding system (`seedProfileCache`) pre-populates React Query cache with partial data from feed cards. When navigating to a profile from a card, the seed writes `followers: 0, following: 0, bio: ''` because the card doesn't have this data.

Combined with `placeholderData: keepPreviousData` in the profile hook, this creates a race condition:

1. User clicks a card → seed writes `{followers: 0, following: 0, bio: ''}` for key `['dehub-profile', 'maldoteth', undefined]`
2. Auth hasn't loaded yet → query runs with `address: undefined` → finds seeded data → shows 0s immediately
3. Auth loads → query key changes to `['dehub-profile', 'maldoteth', '0xViewer...']`
4. `keepPreviousData` keeps showing the 0-follower seeded data from the old key while the new query fetches
5. If there's any delay, the user sees 0 followers/following and no bio

The API actually returns **63 followers, 192 following, and bio "building DeHub."** — so the data is fine, it's a client-side caching issue.

## Fix

**1. Include follower/following counts in the seed when available** — The `CardHeader` seed doesn't pass follower/following data even though some feed cards have it. Minor improvement but not the core fix.

**2. Don't seed critical stats with 0 defaults** — Change `seedProfileCache` to preserve existing non-zero values or skip seeding followers/following when the source doesn't have them. Instead of defaulting to 0, use the existing cached value or `undefined`.

**3. Merge seed data instead of replacing** — When seeding, merge partial data with any existing cache entry instead of only writing when empty. This way if real data arrived first, the seed can't overwrite it with 0s.

Concretely:
- In `profile-cache-seed.ts`: Change the seed to merge with existing cache data rather than only writing when empty. Use existing `followers`/`following` values when the seed source doesn't provide them.
- In `profile-cache-seed.ts`: Only set `followers`/`following` in the seed if the source data actually has them (not defaulting to 0).

## Changes

**`src/lib/profile-cache-seed.ts`**:
- Change `following: data.followings ?? data.following ?? 0` to only include if present (not default 0)
- Change `followers: data.followers ?? 0` to only include if present
- Change `bio: data.bio || ''` to only include if present
- Switch from "only seed if empty" to "merge with existing, preferring non-zero/non-empty values"

This ensures the seed never overwrites real data with zeros, and never introduces misleading 0 values when the source simply doesn't have follower counts.

