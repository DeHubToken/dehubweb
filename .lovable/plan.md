

## Save Default Categories in Post Modal

### What it does
Adds a small save icon (floppy disk) that appears after the selected category chips in the post modal. When tapped, it saves the current categories to local storage as defaults. Every time the user opens the post modal, those saved categories are automatically pre-filled.

### How it works
1. User selects categories as usual
2. A save icon appears at the end of the category chips row
3. Tapping it stores the categories in localStorage and shows a confirmation toast
4. Next time the modal opens, categories auto-populate from the saved defaults

---

### Technical Details

**File: `src/features/post/components/PostAccessToggles.tsx`**
- Import `Save` from `lucide-react`
- Add a localStorage key constant: `DEFAULT_CATEGORIES_KEY = 'post_default_categories'`
- Add a `saveDefaultCategories` handler that writes the current `selectedCategoriesArray` to localStorage and shows a toast
- Place the save button after the last category chip in the flex-wrap container (line ~237, after the `.map()` block), styled as a small subtle icon matching the existing `Plus` button style

**File: `src/features/post/hooks/usePostForm.ts`**
- On initialization (line ~116), read `post_default_categories` from localStorage
- Use the stored value as the initial state for `selectedCategory` instead of empty string `''`
- The format will be a comma-separated string (matching how categories are already stored in state)

**File: `src/features/post/components/PostAccessToggles.tsx` (save handler)**
```
const saveDefaultCategories = () => {
  localStorage.setItem('post_default_categories', selectedCategory);
  toast.success('Default categories saved');
};
```

### UI placement
The save icon sits inline after the category chips, inside the same `flex-wrap` container -- after the mapped chips and before the closing `</div>`. It only renders when categories are selected.
