
## Normalize Filter Tab Dimensions on Features Page

The three filter rows on the Features page currently have inconsistent sizing:

- **Requests/Shipped toggle**: `py-2`, `rounded-xl` wrapper with `p-1`
- **Category pills** (All, UI/UX, etc.): `px-3 py-2`, `rounded-xl` -- tallest
- **Sort tabs** (Most Voted, Newest): `px-3 py-1.5`, `rounded-lg` -- shortest

### Changes

**File: `src/pages/app/FeaturesPage.tsx`**

Standardize both the Category pills and Sort tabs to the same dimensions:

1. **Category pills** (line ~634): Change `px-3 py-2 rounded-xl` to `px-3 py-1.5 rounded-lg` and update the active indicator's `rounded-xl` to `rounded-lg`
2. **Sort tabs** (line ~662): Already at `px-3 py-1.5 rounded-lg` -- no change needed (this is the target size)

This makes both filter rows use identical `px-3 py-1.5 rounded-lg text-sm` sizing with matching `rounded-lg` active indicators, creating a uniform look beneath the Requests/Shipped toggle (which stays larger as the primary page-level switch).
