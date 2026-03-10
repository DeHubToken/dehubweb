

## Add Categories Section to Post Info Page

**What**: Display post categories as pills/badges below the Content section on the Post Info page.

**Where**: `src/pages/app/PostInfoPage.tsx`, after the content section (line 902), before the closing `</div>` on line 905.

**How**:
- Normalize `nftInfo.category` (can be `string | string[]`) into an array
- Render a new section with `Tag` icon header and category pills using the same card style (`bg-white/5 rounded-xl p-4 border border-white/10`)
- Each category rendered as a small pill (`bg-white/10 rounded-lg px-3 py-1.5 text-sm text-white`)
- Only show the section if categories exist and array is non-empty
- `Tag` icon is already imported on line 14

**Implementation** — insert after line 902:
```tsx
{(() => {
  const categories = Array.isArray(nftInfo.category) 
    ? nftInfo.category 
    : nftInfo.category ? [nftInfo.category] : [];
  if (categories.length === 0) return null;
  return (
    <section className="bg-white/5 rounded-xl p-4 border border-white/10">
      <h2 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
        <Tag className="w-4 h-4" />
        Categories
      </h2>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <span key={cat} className="px-3 py-1.5 bg-white/10 rounded-lg text-sm text-white">
            {cat}
          </span>
        ))}
      </div>
    </section>
  );
})()}
```

**File**: `src/pages/app/PostInfoPage.tsx` (1 file, ~15 lines added)

