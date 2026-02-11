
## Wire Up and Render Staking Badges Using `badgeBalance` (Holdings + Staked)

### Context
The API's `badgeBalance` field represents the **combined holdings + staked** amount, not just staked. This is the correct value to use for determining a user's badge tier. It appears in:
- `/api/feed` -- inside `minterUser.badgeBalance` (per post)
- `/api/nft_info/{id}` -- inside `minterUser.badgeBalance` (single post)
- `/api/account_info/{id}` -- as `badgeBalance` on the user object

### Changes (8 files)

**1. `src/lib/api/dehub.ts` -- Add `badgeBalance` to `DeHubUser` interface**
- Add `badgeBalance?: number;` alongside the existing `staked` field (~line 92)

**2. `src/lib/staking-badges.ts` -- Rename parameter for clarity**
- Rename `stakingAmount` to `badgeBalance` in function signatures and JSDoc comments to reflect that this is holdings + staked, not just staked
- No logic changes needed -- the tier lookup works the same way

**3. `src/hooks/use-unified-feed.ts` -- Use `badgeBalance` from `minterUser`**
- Add `badgeBalance?: number;` to the `minterUser` sub-interface inside `UnifiedFeedItem` (~line 101-107)
- In all three mappers (`mapToVideoItem`, `mapToImagePost`, `mapToTextPost`), change:
  - `stakedAmount: item.minterStaked` to `stakedAmount: item.minterUser?.badgeBalance ?? item.minterStaked`
- `badgeBalance` is preferred since it includes holdings + staked; `minterStaked` is kept as fallback

**4. `src/hooks/use-dehub-feed.ts` -- Extract `badgeBalance` in legacy mappers**
- In `mapNFTToVideoItem` and `mapNFTToImagePost`, add:
  - `stakedAmount: nft.minterUser?.badgeBalance`

**5. `src/hooks/use-dehub-profile.ts` -- Use `badgeBalance` for profile badge**
- Update the `staked` field resolution in `mapUserToProfile` to prefer `badgeBalance`:
```
staked: user.badgeBalance ?? (typeof user.staked === 'number' ? user.staked : user.balanceData?.[0]?.staked)
```
- `badgeBalance` is preferred because it's the combined holdings + staked value

**6. `src/pages/app/SinglePostPage.tsx` -- Replace hardcoded `undefined` with real data**
- In all four transform functions (`toVideoItem`, `toImagePost`, `toTextPost`, `toLiveStream`), replace `stakedAmount: undefined` with:
  - `stakedAmount: nft.minterUser?.badgeBalance ?? (nft as any).minterStaked`

**7. `src/components/app/cards/CardHeader.tsx` -- Render badge icon**
- Add optional prop: `stakedAmount?: number`
- Import `getBadgeUrl` from `@/lib/staking-badges`
- Render a 16x16px badge image inline after the verified badge / username
- Only render when `stakedAmount` is defined

**Feed card components** (`PostCard.tsx`, `ImageCard.tsx`, `VideoCard.tsx`): Pass `stakedAmount` through to `<CardHeader>` from the item data.

**8. `src/pages/app/ProfilePage.tsx` -- Render badge on profile**
- Import `getBadgeUrl` from `@/lib/staking-badges`
- Next to the profile display name / verified badge, render a 20x20px badge image using `getBadgeUrl(profile.staked)`
- Only render when `profile.staked` is defined

### Data Flow

```text
/api/feed         --> minterUser.badgeBalance --> UnifiedFeed mappers --> stakedAmount --> CardHeader (badge icon)
/api/nft_info     --> minterUser.badgeBalance --> SinglePostPage transforms --> stakedAmount --> CardHeader (badge icon)
/api/account_info --> badgeBalance             --> ProfileHook (profile.staked) --> ProfilePage (badge icon)
```

### Key Difference From Previous Plan
- `badgeBalance` = holdings + staked (combined), which is the correct value for tier determination
- `minterStaked` and `staked` are kept only as fallbacks for backward compatibility
- The badge utility functions in `staking-badges.ts` work unchanged since the tier logic is the same regardless of what the input number represents

### Scope
- 8 files modified
- No new files, dependencies, or database changes
