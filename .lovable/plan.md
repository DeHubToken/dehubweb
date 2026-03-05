

## Problem: First-visit re-render/flash on dynamic routes

**Root cause identified**: The `<Suspense fallback={<PageLoader />}>` at `src/App.tsx:107` wraps **everything**, including `<AppLayout />`. When you navigate to a dynamic route (`/:username`, `/app/post/:postId`, `/app/post/:postId/info`) for the first time, the lazy component (`ProfilePage`, `SinglePostPage`, `PostInfoPage`) hasn't loaded yet. React hits the Suspense boundary, and since the nearest one is **above** `AppLayout`, it replaces the entire layout tree (header, sidebar, right panel) with a blank black `<div>`. Once the chunk loads, the whole layout remounts — causing the logo, burger menu, sidebar badges, and everything else to flash.

After the first visit, the chunk is cached by the browser, so subsequent navigations are instant with no Suspense trigger.

The `PersistentPageCache` pages don't have this problem because they have their own `<Suspense fallback={<SkeletonComponent />}>` boundaries **inside** the layout.

## Fix

**Wrap each dynamic route element in its own `<Suspense>` boundary** so that only the content area shows a skeleton/loader while the layout stays mounted.

### Changes to `src/App.tsx`

1. Create a small inline `<DynamicPageLoader>` wrapper (or just inline `<Suspense>`) around each lazy dynamic route element:

```tsx
// Instead of:
<Route path="post/:postId" element={<SinglePostPage />} />

// Do:
<Route path="post/:postId" element={
  <Suspense fallback={<div className="min-h-screen" />}>
    <SinglePostPage />
  </Suspense>
} />
```

2. Apply the same pattern to all dynamic lazy routes inside the `<AppLayout />` group:
   - `post/:postId` → wrap `<SinglePostPage />`
   - `video/:tokenId` → wrap `<SinglePostPage />`
   - `post/:postId/info` → wrap `<PostInfoPage />`
   - `governance/:proposalId` → wrap `<GovernanceProposalPage />`
   - `/:username` → wrap `<ProfilePage />`

3. Optionally use the appropriate page skeleton (`ProfileSkeleton`, `GenericPageSkeleton`) as the fallback instead of an empty div, for a polished loading state.

4. The outer `<Suspense>` at line 107 stays for non-layout routes (landing page, docs, etc.) — no change needed there.

This is a ~15-line change in a single file. The layout tree will never unmount during first-visit navigations again.

