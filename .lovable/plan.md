

## Add Edit Post to Post Info Page

### What Changes
Add an "Edit Post" button to the Post Info page so the post creator can edit their post's title, description, and categories directly from this page, without needing to go back to the feed.

### Where It Appears
- A new "Edit Post" button will appear in the Post Info page, only visible when the logged-in user is the post creator (minter).
- It will be placed in the header area, next to the chain badge (top-right), as a pencil icon button.

### Technical Details

**File: `src/pages/app/PostInfoPage.tsx`**
1. Import `EditPostModal` from `@/components/app/modals/EditPostModal`.
2. Import `Pencil` icon from `lucide-react`.
3. Add `showEditModal` state (`useState(false)`).
4. In the header bar (sticky top), add a pencil icon button that only renders when `isOwner` is true. Place it between the title and the chain badge.
5. Render `<EditPostModal>` at the bottom of the component, passing:
   - `tokenId={nftInfo.tokenId}`
   - `currentTitle={nftInfo.title || nftInfo.name}`
   - `currentDescription={nftInfo.description}`
   - `currentCategories={nftInfo.category}` (from API data)
   - `onSuccess` that invalidates the `['nft-info', postId]` query to refresh the page data.
