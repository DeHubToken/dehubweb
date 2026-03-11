

# Replace Tag icon with Hash icon for categories

Swap the Lucide `Tag` icon to `Hash` icon in all category-related UI locations:

1. **`src/features/post/components/PostAccessToggles.tsx`** (line 3, 244, 329)
   - Replace `Tag` with `Hash` in the import
   - Line 244: Category toggle row icon
   - Line 329: "Select Categories" drawer header

2. **`src/pages/app/PostInfoPage.tsx`** (line 14, 914)
   - Replace `Tag` with `Hash` in import
   - Line 914: Categories section header on post info page
   - Keep `Tag` import if still used for Listings (lines 160, 198, 213) — check usage

3. **`src/components/app/modals/GoLiveModal.tsx`** (line 2, 365)
   - Replace `Tag` with `Hash` in import for category label
   - Line 365: Category label in Go Live modal

All other `Tag` usages (PostInfoPage listings, CareersPage, JobsPage) are unrelated to categories and remain unchanged.

