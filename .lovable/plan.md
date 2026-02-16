
## Fix: Uniform Border Gap on Search Bento

**Problem:** The outer container and inner input both use `rounded-xl` (12px). When nesting rounded rectangles with a 3px gap, the inner radius should be `12px - 3px = 9px` to keep the visible border uniform on all sides. With matching radii, the corners create a wider visual gap than the straight edges.

**Solution:** Change the inner Input's border-radius to a slightly smaller value so the curves are concentric.

---

### Technical Details

**File:** `src/components/app/RightSidebar.tsx` (line 38)

- Change the Input's class from `rounded-xl` (12px) to `rounded-[9px]` so the inner curve is concentric with the outer `rounded-xl`, keeping the 3px gap uniform around all sides including corners.
