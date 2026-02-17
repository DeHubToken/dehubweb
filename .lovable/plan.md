

## Change "connect your wallet" toasts to "log in"

All instances of "Please connect your wallet to do X" will be updated to "Please log in to do X" across the codebase. Here are the exact changes:

### Files to update

**1. `src/hooks/use-bookmarks.ts` (line 316)**
- "Please connect your wallet to bookmark" -> "Please log in to bookmark"

**2. `src/hooks/use-profile-follow.ts` (line 64)**
- "Please connect your wallet first" -> "Please log in first"

**3. `src/hooks/use-audio-spaces.ts` (lines 152, 215)**
- "Please connect your wallet first" -> "Please log in first" (two occurrences)

**4. `src/components/app/WhoToFollow.tsx` (line 213)**
- "Please connect your wallet to follow users" -> "Please log in to follow users"

**5. `src/components/app/mobile/MobileWhoToFollowCarousel.tsx` (line 189)**
- "Please connect your wallet to follow users" -> "Please log in to follow users"

**6. `src/components/app/cards/CommentsSection.tsx` (lines 561, 610, 666)**
- "Please connect your wallet to like comments" -> "Please log in to like comments"
- "Please connect your wallet to dislike comments" -> "Please log in to dislike comments"
- "Please connect your wallet to comment" -> "Please log in to comment"

**7. `src/components/app/profile/FollowersListDrawer.tsx` (line 264)**
- "Please connect your wallet first" -> "Please log in first"

**8. `src/i18n/locales/en.json` (line 118)**
- "Please connect your wallet first" -> "Please log in first"

**9. `src/pages/app/SettingsPage.tsx` (line 636)**
- Uses `t('settings.connectWalletFirst')` -- this is covered by the i18n change above. The translation key name stays the same, only the English string value changes.

Total: 10 string replacements across 8 files.

