## Plan — Sitemap-index tree for all DeHub posts + profiles

Post IDs are sequential integers (latest post = highest number). That makes chunking trivial: chunk 1 = IDs 1–50000, chunk 2 = 50001–100000, etc. We just need to know the current max ID.

### The tree

```text
https://dehub.io/sitemap.xml              ← ROOT INDEX (edge function)
 ├─ /sitemap-static.xml                   ← blog + guides + landing (existing 121)
 ├─ /sitemap-posts-1.xml    (IDs 1–50000)
 ├─ /sitemap-posts-2.xml    (IDs 50001–100000)
 ├─ …                                     (auto-grows as posts are minted)
 ├─ /sitemap-profiles-1.xml (50k users each)
 └─ /sitemap-profiles-2.xml
```

### What I'll build

1. **`supabase/functions/sitemap-index/index.ts`**
   - Fetches `api.dehub.io/api/feed?limit=1` to read the newest post's ID → `maxPostId`.
   - Fetches profile count from DeHub API (or Supabase profile-cache fallback).
   - Emits `<sitemapindex>` XML with:
     - `sitemap-static.xml`
     - `sitemap-posts-1.xml` … `sitemap-posts-N.xml` where `N = ceil(maxPostId / 50000)`
     - `sitemap-profiles-1.xml` … as needed
   - Cache: `s-maxage=3600`.

2. **`supabase/functions/sitemap-posts/index.ts`**
   - Accepts `?page=N`.
   - Emits `<urlset>` with `<loc>https://dehub.io/app/post/{id}</loc>` for IDs in that 50k range that actually exist (skips gaps by paging `api.dehub.io/api/feed` filtered by range, or just emits all IDs since `/app/post/:id` gracefully 404s — we filter to keep the sitemap clean).
   - Cache: `s-maxage=3600`.

3. **`supabase/functions/sitemap-profiles/index.ts`**
   - Accepts `?page=N`.
   - Pages through DeHub API user list (50k per chunk), emits `<loc>https://dehub.io/{username}</loc>` + `<lastmod>` where available.
   - Cache: `s-maxage=3600`.

4. **Rename `public/sitemap.xml` → `public/sitemap-static.xml`** (content unchanged — still your blog + guide URLs).

5. **`netlify.toml` rewrite** so URLs stay on `dehub.io`:
   ```
   /sitemap.xml                → sitemap-index      (200)
   /sitemap-posts-:n.xml       → sitemap-posts?page=:n
   /sitemap-profiles-:n.xml    → sitemap-profiles?page=:n
   /sitemap-static.xml         → served from /public
   ```

6. **`public/robots.txt`** — one Sitemap line: `Sitemap: https://dehub.io/sitemap.xml`. Remove the stray dynamic-sitemap direct URL.

7. **Delete `supabase/functions/dynamic-sitemap`** — superseded.

### After deploy
- Test: `curl https://dehub.io/sitemap.xml` → should return `<sitemapindex>` listing all children.
- Submit only `https://dehub.io/sitemap.xml` to Google Search Console. GSC follows the index and picks up every child + every URL inside them.
- Every new post auto-appears in the correct chunk on the next hourly cache refresh — no manual maintenance ever.

Approve and I'll build.