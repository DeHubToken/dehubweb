

# Post URL Sharing - Pinned Post Approach

## Overview
Instead of a dedicated post page, the `/app/post/:postId` URL redirects to the home feed with that specific post pinned at the top. This provides a seamless experience where users land in the natural app flow and can continue scrolling after viewing the shared content.

## Flow
1. User visits `/app/post/2530`
2. `PostPage.tsx` redirects to `/app` with `state: { pinnedPostId: "2530" }`
3. `HomePage` reads the state and passes it to `HomeFeed`
4. `HomeFeed` fetches that specific post and renders it first
5. User sees the shared post at top, then normal feed below
6. They can scroll down and continue using the app naturally

## Technical Implementation

### File: `src/pages/app/PostPage.tsx`
Simple redirect component that captures postId and navigates to home with state.

### File: `src/pages/app/HomePage.tsx`
- Reads `pinnedPostId` from `location.state`
- Passes it to `HomeFeed` component

### File: `src/components/app/feeds/HomeFeed.tsx`
- Accepts optional `pinnedPostId` prop
- Fetches pinned post using `getNFTInfo(pinnedPostId)`
- Converts it to feed item format (VideoItem, ImagePost, or TextPost)
- Filters it from the main feed to avoid duplicates
- Renders pinned post first, then rest of feed

## Benefits
- Seamless user experience - no separate page to navigate away from
- Users naturally discover more content after viewing shared post
- Maintains app context and navigation state
- Back button works naturally (returns to previous page, not stuck in post view)
