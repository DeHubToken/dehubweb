

## Fix: Avatars and Thumbnails Breaking

### Root Cause

**Avatars:** React Query v5 forbids `queryFn` from returning `undefined`. The `useProfileAvatar` hook in `src/hooks/use-profile-avatar-cache.ts` returns `undefined` in several code paths (when no URL is found, when fallbackUrl is itself undefined). This causes React Query to throw an error, which makes every avatar query fail and fall back to showing initial letters.

**Thumbnails:** The video files on the CDN are returning `MEDIA_ELEMENT_ERROR: Format error`. This causes the `VideoThumbnail` canvas extraction to fail. This is a separate, pre-existing issue with specific CDN video files, not a code regression.

### Changes

**File: `src/hooks/use-profile-avatar-cache.ts`**

1. Change the `queryFn` to return `null` instead of `undefined` in all code paths -- React Query v5 accepts `null` but not `undefined`
2. Update the return type to `string | null` where needed
3. Also fix the `useAvatarPrefetch` function which has the same issue (line 194: `return undefined`)

Specific changes:
- Line 140: `return undefined` changes to `return null`
- Line 144: `return url || fallbackUrl` changes to `return url || fallbackUrl || null`
- Line 148: `return fallbackUrl` changes to `return fallbackUrl || null`
- Line 194: `return undefined` changes to `return null`

### No Other Files Need Changes

The i18n lazy-loading changes did not cause this issue. The avatar bug is a React Query v5 compatibility issue that may have been latent and recently surfaced due to a dependency update or query re-evaluation timing.

