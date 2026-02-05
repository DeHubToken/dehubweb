
# Fix: Image URLs Not Loading on Direct URL Access

## Problem Identified

When accessing `/app/post/2729` directly via browser URL, the image doesn't load. However, it loads fine when navigating from within the app.

### Root Cause

The API returns different path formats in `imageUrls`:
- **New posts**: `["feed-images/abc.jpg", "feed-images/def.png"]` 
- **Older/NFT posts**: `["nfts/images/2729-1.jpg", "nfts/images/2729-2.jpg"]`

The `buildFeedImageUrls()` function in `src/lib/media-url.ts` currently:
1. Extracts just the filename (e.g., `2729-1.jpg`)
2. Always places it under `feed-images/` folder

This produces the wrong URL for paths starting with `nfts/images/`:
- Current output: `https://dehubcdn.../feed-images/2729-1.jpg` (broken)
- Correct output: `https://dehubcdn.../images/2729-1.jpg` (works)

### Why It Works In-App

When navigating from the feed, the data is cached and may come from the unified feed which handles it differently or the paths may already be fully resolved.

---

## Solution

Update `buildFeedImageUrls()` to detect the path prefix and route accordingly:

| Path Prefix | Output Folder |
|-------------|---------------|
| `nfts/images/` | `images/` |
| `feed-images/` | `feed-images/` |
| Other | Preserve relative path |

---

## Technical Details

### File to Modify: `src/lib/media-url.ts`

```typescript
/**
 * Build multi-image URLs from API paths
 * API returns arrays like:
 * - ["feed-images/abc.jpg"] → cdn/feed-images/abc.jpg
 * - ["nfts/images/2729-1.jpg"] → cdn/images/2729-1.jpg (strips nfts/ prefix)
 */
export function buildFeedImageUrls(apiImageUrls: string[] | undefined | null): string[] | undefined {
  if (!apiImageUrls || apiImageUrls.length === 0) return undefined;
  
  return apiImageUrls.map((imgUrl) => {
    // Already a full URL - return as-is
    if (imgUrl.startsWith('http')) return imgUrl;
    
    // Handle "nfts/images/xxx.jpg" → "images/xxx.jpg"
    if (imgUrl.startsWith('nfts/')) {
      const pathWithoutNfts = imgUrl.slice(5); // Remove "nfts/" prefix
      return `${DEHUB_CDN_BASE}${pathWithoutNfts}`;
    }
    
    // Handle "feed-images/xxx.jpg" → extract filename and build URL
    if (imgUrl.startsWith('feed-images/')) {
      const filename = imgUrl.split('/').pop() || '';
      if (filename) {
        return `${DEHUB_CDN_BASE}feed-images/${filename}`;
      }
    }
    
    // Handle "images/xxx.jpg" directly
    if (imgUrl.startsWith('images/')) {
      return `${DEHUB_CDN_BASE}${imgUrl}`;
    }
    
    // Fallback: extract filename and put in feed-images (legacy behavior)
    const filename = imgUrl.split('/').pop() || '';
    if (filename) {
      return `${DEHUB_CDN_BASE}feed-images/${filename}`;
    }
    
    return imgUrl;
  });
}
```

---

## Testing Checklist

- Load `/app/post/2729` directly in browser - image should display
- Navigate to same post from feed - image should still work
- Test other image posts with different path formats
- Verify multi-image posts show all images correctly
