

## Fix: Align Trending Categories With What Users Actually See

### Problem
The trending sidebar analyzes 250 posts (5 cached pages) to rank categories, but when a user clicks a category, the feed makes a fresh API call that only shows what's available on the current page. "funny" appears as the #1 trending category (found 17 times across 250 posts), but when clicked, the filtered feed only shows 1 post because most "funny" posts are scattered across later pages.

### Root Cause
The disconnect is between:
- **Sidebar ranking**: Scans 250 cached posts to count category frequency
- **Filtered feed**: Makes a fresh API call with `category=funny`, which only returns matching posts from the external API's page 1 (often just 1-2 results)

There's no way to force the external DeHub API to return more category-filtered results -- we can only control what we count and display.

### Solution
Two-pronged approach to make the sidebar honest about what users will see:

**1. Edge Function (`supabase/functions/refresh-feed-cache/index.ts`)**
- Revert to counting categories from only page 1 (50 posts) instead of all 5 pages
- This ensures the trending ranking reflects what's actually in the first page of results users see
- Categories with genuinely high presence on page 1 will rank higher

**2. Sidebar UI (`src/components/app/WhatsHappening.tsx`)**  
- No changes needed -- post counts are already removed from the previous update
- The ranking order alone communicates relative popularity

### Why Not Just Increase Feed Page Size?
The external DeHub API controls pagination. We can't force it to return all "funny" posts at once. Even with `limit=50`, the category filter might only match a few items on a given page. The only reliable fix is to make the sidebar ranking match reality.

### Technical Details

Edge function change (single line):
```
// Change from:
.like("cache_key", "feed_latest_page%")
// Back to:
.eq("cache_key", "feed_latest_page1")  
```

This is intentionally scoped to page 1 only. The ranking will be less "comprehensive" but far more honest -- if "funny" appears 3 times in 50 posts, it genuinely means users will see ~3 funny posts when they click through.
