
# Plan: Integrate DeHub API for User Profile Posts

## Overview
Update the profile page to show each user's actual posts by fixing the API integration. The current implementation has issues with both the API endpoint and content type detection.

## Current Issues Found
1. **API Endpoint**: The `getUserNFTs` function calls `/api/user/{userId}/nfts` which may not be returning data correctly
2. **Content Detection**: The `separateUserContent` function only checks `nft.media_type` but the DeHub API primarily uses `postType` field
3. **Empty Content**: Profile tabs show "0" counts because content isn't being fetched/categorized properly

## Solution Approach

### Step 1: Update `useDeHubUserContent` Hook
Instead of using the less reliable `/api/user/{userId}/nfts` endpoint, leverage the proven `searchNFTs` function with the `creator_id` parameter to filter posts by creator.

**Changes to `src/hooks/use-dehub-profile.ts`:**
- Import `searchNFTs` from the API module
- Replace `getUserNFTs` call with `searchNFTs({ creator_id: userId, ... })`
- This uses the same API that successfully powers the home feed

### Step 2: Fix Content Type Detection
Update `separateUserContent` to check both `postType` (primary) and `media_type` (fallback) fields from the API response.

**Changes to `src/hooks/use-dehub-profile.ts`:**
```text
Current logic:
  - Only checks nft.media_type

Updated logic:
  - Check nft.postType first (primary API field)
  - Fall back to nft.media_type
  - Use the getContentType helper from use-dehub-feed.ts
```

### Step 3: Handle Loading States
Add loading indicator for content while it's being fetched separately from the profile.

**Changes to `src/pages/app/ProfilePage.tsx`:**
- Show skeleton or spinner in tab content area while `isLoadingContent` is true
- Display appropriate empty states when content loads but is empty

## Technical Details

### API Integration
The `searchNFTs` function already supports these parameters:
- `creator_id`: Filter by creator's wallet address
- `page`/`unit`: Pagination
- `sortMode`: Sort by new/popular/trending
- `postType`: Filter by content type (undefined for all, "feed-images" for images only)

### Data Flow
```text
User visits /{username}
    ↓
useDeHubProfile fetches user data → gets walletAddress
    ↓
useDeHubUserContent fetches posts → searchNFTs({ creator_id: walletAddress })
    ↓
separateUserContent categorizes → checks postType || media_type
    ↓
ProfilePage renders tabs with real data
```

## Files to Modify
1. `src/hooks/use-dehub-profile.ts` - Fix API call and content type detection
2. `src/pages/app/ProfilePage.tsx` - Add loading state for content area

## Expected Outcome
- Profile pages will show actual posts from each user
- Tab counts (All, Images, Videos) will reflect real content
- Content will display using the same cards as the main feeds
