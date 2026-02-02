
# Plan: Instant Post Navigation from Feed

## Problem
When clicking a post in the feed, the dedicated post page shows a loading spinner while making a new API call—even though the feed already has all the data for that post.

## Solution
Pre-populate the single-post cache when navigating from the feed, so the post page displays instantly with no loading phase.

## How It Works
When you click a post card in the feed:
1. Before navigating, the card will save its data to React Query's cache using the `['single-post', id]` key
2. The SinglePostPage will find this data already cached and display it immediately
3. No loading spinner, no delay—the content appears instantly

## What Changes

### 1. Create a Cache Helper
A small utility function to save post data before navigation.

### 2. Update Card Components
Modify VideoCard, ImageCard, and PostCard to cache their data when clicked:
- Convert the display data back to the API format
- Store it in the `['single-post', id]` cache
- Then navigate to the post page

### 3. SinglePostPage Adjustment
Update the query to use `placeholderData` from the cache when available, ensuring instant display while still allowing background refresh for the latest data (like new comments).

## User Experience
- **Before**: Click post → Loading spinner → Content appears
- **After**: Click post → Content appears instantly (feels native)

## Technical Note
The background refetch can still happen silently to get fresh engagement stats (likes, comments), but the user sees content immediately without any visible loading state.
