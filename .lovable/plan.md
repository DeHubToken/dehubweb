

## Profile Loading Performance — Analysis & Plan

### Current Bottlenecks

After reviewing the code, here is the loading waterfall:

```text
1. isLoadingProfile → FULL SCREEN SPINNER (blocks everything)
   └─ Single API call to api.dehub.io/api/account_info/{user}
      
2. Only after profile resolves (walletAddress available):
   ├─ useDeHubUserContent (feed API, 50 items)
   ├─ getUserReposts (50 reposts)
   │   └─ N × getNFTInfo() for each quote post (N+1 problem)
   ├─ getUserComments (20 items, just for count)
   ├─ useCreatorPlans
   ├─ useIsSubscribed
   └─ useUserPrivacySettings
```

**Problem 1 — Full-screen spinner**: While the profile API call is in-flight, the user sees nothing but a spinning loader. The entire page is blocked.

**Problem 2 — Repost N+1**: Each quote repost triggers an individual `getNFTInfo()` call. If someone has 10 quote posts, that is 10 sequential-ish API calls just for enrichment.

**Problem 3 — Comment count fetch**: A full 20-item comment fetch happens just to get a tab count number.

### Plan

#### 1. Replace full-screen spinner with skeleton UI
- Remove the `if (isLoadingProfile) return <Loader2 />` gate
- Show a skeleton profile header (cover placeholder, avatar circle, name bars) while loading
- Allow the page layout to render immediately — content sections show their own loading states

#### 2. Limit repost enrichment
- Cap quote post enrichment to 5 concurrent calls max (use `Promise.allSettled` with batching)
- Skip enrichment entirely if the repost already has inline data
- Add a short `staleTime` so revisits don't re-fetch

#### 3. Lazy-load comment count
- Only fetch comment count when the "Posts" tab is visible or after a 2-second delay
- Use a lightweight count-only query parameter if the API supports it, or just show "—" until loaded

#### 4. Navigation cache injection
- When navigating to a profile from a feed card or follower list, inject known data (username, avatar, address) into the `dehub-profile` query cache so the skeleton can show partial info instantly

### Technical Details

**Files to modify:**
- `src/pages/app/ProfilePage.tsx` — Replace spinner with skeleton component
- `src/hooks/use-profile-page.ts` — Lazy comment count, cap repost enrichment
- `src/components/app/profile/ProfileHeader.tsx` — Accept loading state, show skeleton variant
- New: `src/components/app/profile/ProfileSkeleton.tsx` — Skeleton UI component

