

# Fix Image Posts Not Loading on Direct URL Access

## Root Cause

The `getContentType()` function in `SinglePostPage.tsx` doesn't recognize the API's `"feed-images"` post type. Here's what happens:

1. The DeHub API returns `postType: "feed-images"` for image posts
2. The `getContentType()` function checks for `postType === 'image'` but never for `'feed-images'`
3. It also checks `post.imageUrl && !post.videoUrl`, but image posts with `postType: "feed-images"` don't have a top-level `imageUrl` field -- they only have `imageUrls` (plural array)
4. So the function falls through to returning `'post'` (text post)
5. The post renders as a `PostCard` (text-only) instead of an `ImageCard`

This explains why:
- Clicking from the feed works (the feed's own mappers already handle `"feed-images"` correctly and cache the normalized data)
- Direct URL access shows a broken version (the content type detection fails, showing a text card instead of an image card)

## Fix

Update the `getContentType()` function to handle the `"feed-images"` post type and the `imageUrls` array:

```typescript
function getContentType(post: DeHubNFT): 'video' | 'image' | 'post' | 'live' {
  if ((post as any).postType === 'live' || (post as any).isLive !== undefined) return 'live';
  if (post.postType === 'video' || post.videoUrl) return 'video';
  if (
    post.postType === 'image' || 
    post.postType === 'feed-images' ||
    (post.imageUrls && post.imageUrls.length > 0 && !post.videoUrl) ||
    (post.imageUrl && !post.videoUrl)
  ) return 'image';
  return 'post';
}
```

This adds two new conditions:
- `post.postType === 'feed-images'` -- matches the API's actual post type string
- `post.imageUrls && post.imageUrls.length > 0 && !post.videoUrl` -- catches cases where there's no explicit postType but the post has image URLs

## File Changed

| File | Change |
|------|--------|
| `src/pages/app/SinglePostPage.tsx` | Update `getContentType()` to handle `"feed-images"` postType and `imageUrls` array |

## Scope

This is a one-line fix in a single function. No other files need changes since the image normalization (`toImagePost`) and the `buildFeedImageUrls` utility already produce the correct CDN URLs.
