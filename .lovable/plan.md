

## Compress Heavy Image Assets (>500KB to ~500KB)

**Approach:**
Create a temporary browser-based compression utility that uses the HTML Canvas API to resize and re-encode each oversized PNG. The utility will run in the sandbox browser, and compressed images will be extracted and written back to the project, replacing the originals.

**How it works:**
1. Create a temporary edge function (`compress-image`) that:
   - Accepts an image URL and target max file size
   - Fetches the image, decodes it, resizes proportionally until it fits under ~500KB
   - Returns the compressed image as base64
2. For each of the 20 heavy assets, call the edge function and write the compressed result back to the original file path
3. Clean up the temporary edge function afterward

**Assets to compress (20 files, ~19MB total):**

| Asset | Current Size |
|---|---|
| yorkie-sprite.png | 2.91 MB |
| apex-category.png | 2.81 MB |
| fortnite-category.png | 1.53 MB |
| gta-category.png | 1.07 MB |
| subs-3d-icon.png | 993 KB |
| ai-star-icon.png | 970 KB |
| johncena.png | 911 KB |
| cod-category.png | 876 KB |
| home-3d-icon.png | 863 KB |
| comment-3d-icon.png | 791 KB |
| rickybobby.png | 755 KB |
| image-frame-3d-icon.png | 748 KB |
| filmstrip-3d-icon.png | 710 KB |
| roblox-category.png | 698 KB |
| minecraft-category.png | 676 KB |
| valorant-category.png | 652 KB |
| messages-3d-icon.png | 605 KB |
| league-category.png | 574 KB |
| search-3d-icon.png | 556 KB |
| bookmark-3d-icon.png | 536 KB |

**Technical details:**
- The edge function will use Deno-compatible image decoding and Canvas API to resize images
- Images are scaled down proportionally (reducing dimensions) and re-encoded as PNG
- Quality and dimensions are iteratively adjusted until the output is under 500KB
- Original file paths are preserved so no code changes are needed anywhere
- The edge function is deleted after compression is complete

**Expected result:** ~19MB reduced to ~10MB total, with no asset exceeding 500KB.

