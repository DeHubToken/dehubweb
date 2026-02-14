

## Performance Fix: Stop Category Count Spam and Lazy-Load Categories

### Problem Identified

The network logs reveal the root cause: the **"Talk of the Town" sidebar widget** (`WhatsHappening.tsx`) fires a separate `/api/feed?category=X&limit=1` request for **every single category** simultaneously. With dozens of categories, this triggers **429 Too Many Requests** rate limiting from the DeHub API, which then blocks or delays the actual feed content from loading.

Additionally, categories are eagerly fetched on Videos and Shorts tab mount even though they're hidden inside a dropdown that users may never open.

### Also Fixing: Shorts Default Sort

The Shorts feed currently defaults to `SORT_OPTIONS[1]` ("Following"), which isn't implemented yet. This will be changed to `SORT_OPTIONS[0]` ("Latest").

---

### Changes

**1. WhatsHappening.tsx -- Remove per-category API spam**
- Stop firing individual `/api/feed` requests for every category
- Instead, just display categories from the existing `getCategories()` call (no counts) or show static counts
- This eliminates 30-50+ simultaneous API calls that cause rate limiting

**2. ShortsFeed.tsx -- Lazy-load categories**
- Change the `useQuery` for categories to only run when the filter dropdown is open (`enabled: showFilters`)
- Show a loading spinner inside the category section when categories are being fetched
- Fix the default sort from `SORT_OPTIONS[1]` (Following) to `SORT_OPTIONS[0]` (Latest)

**3. VideosFeed.tsx -- Lazy-load categories**
- Same lazy-loading treatment: only fetch categories when the filter dropdown is open
- Show a loading spinner while categories load on first open

### Technical Details

```
WhatsHappening.tsx:
  - Remove fetchCategoryCount() function
  - Remove getCategoriesWithCounts() function  
  - Use plain getCategories() query (already cached, shared key)
  - Display categories without counts (or with a simple "trending" indicator)

ShortsFeed.tsx line 318:
  - Change SORT_OPTIONS[1] to SORT_OPTIONS[0]

ShortsFeed.tsx lines 330-335:
  - Add enabled: showFilters to the useQuery

VideosFeed.tsx lines 482-487:
  - Add enabled: showFilters to the useQuery

Both feeds:
  - Add a small Loader2 spinner in the category section 
    while isLoading is true
```

### Expected Impact
- Eliminates 30-50+ unnecessary API calls on page load
- Prevents 429 rate limiting that blocks actual content
- Feed content loads significantly faster
- Categories appear instantly when dropdown is opened (after first load, cached for 30 min)

