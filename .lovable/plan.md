
# Fix Live Stream Thumbnails Not Loading

## Root Cause

In `src/hooks/use-dehub-feed.ts` line 446, the thumbnail CDN URL is built with a double slash:

```
DEHUB_CDN_BASE = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/"
                                                                   ^-- trailing slash

`${DEHUB_CDN_BASE}/${rawThumbnail}`  -->  "...//" (broken URL, 404)
```

## Fix

### `src/hooks/use-dehub-feed.ts` (line 446)

Remove the extra `/` so the URL concatenates correctly:

```typescript
// Before
`${DEHUB_CDN_BASE}/${rawThumbnail}`

// After
`${DEHUB_CDN_BASE}${rawThumbnail}`
```

One character removed, one file changed. Thumbnails will resolve to valid CDN URLs immediately.
