

## Plan: Unify Mobile and Desktop Post Action Buttons

### Problem
On mobile, the separate Image and Video buttons are hidden (`hidden sm:block`) and replaced with a single Paperclip icon (`sm:hidden`). This limits mobile users and creates an inconsistent experience.

### Changes

**File: `src/features/post/components/PostActionBar.tsx`**

1. **Remove the mobile Paperclip button** (lines 214-228) — delete the entire block with `sm:hidden` and the `Paperclip` import.

2. **Make the Image button visible on all screen sizes** (line 237) — change `hidden sm:block` to just show always:
   - `className="p-2 hover:bg-white/10 rounded-xl transition-colors"` (remove `hidden sm:block`)

3. **Make the Video button visible on all screen sizes** (line 253) — same change:
   - `className="p-2 hover:bg-white/10 rounded-xl transition-colors"` (remove `hidden sm:block`)

4. **Clean up the `Paperclip` import** from the lucide-react import line since it's no longer used.

### Result
Mobile and desktop will both show the separate Image and Video icons, matching the desktop layout exactly.

