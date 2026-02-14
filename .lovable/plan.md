

## Fix: Analyze All Cached Pages for Trending Categories

### Problem
Currently, trending categories only analyze 50 posts (page 1). This gives a very narrow view of what's actually trending. Previously it analyzed all 5 pages but showed post counts that didn't match when clicked.

### Solution
Analyze all 5 cached pages (250 posts) to determine what's truly trending, but remove the exact post count from the sidebar to avoid the mismatch issue. Instead, show a relative popularity indicator.

### Changes

**1. Edge Function: `supabase/functions/refresh-feed-cache/index.ts`**
- Change the query back to read all 5 cached latest pages (`feed_latest_page1` through `feed_latest_page5`) instead of just page 1
- This gives 250 posts worth of data for more accurate trending analysis

**2. Sidebar UI: `src/components/app/WhatsHappening.tsx`**
- Remove the exact "X posts" count label from each category row
- The ranking order itself already communicates which categories are most popular
- This eliminates the count mismatch problem entirely since there's no number to disagree with

### Why This Works
- Trending order is based on 250 posts instead of 50, giving a much better signal
- No misleading post counts that don't match when clicked
- Categories are ranked by true popularity, and the rank position alone tells users what's hot

### Technical Details
- Edge function query changes from `.eq("cache_key", "feed_latest_page1")` to `.like("cache_key", "feed_latest_page%")`
- UI removes the `post_count` display span from each category button
- The `post_count` field is still computed and stored (used for sorting) but not shown to users

