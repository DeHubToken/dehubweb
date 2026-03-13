

# Remove Country Dropdown from Sidebar, Keep on Explore Page

## What changes
1. **`src/components/app/WhatsHappening.tsx`** — Add an optional `showCountrySelector` prop (default `false`). Wrap the country dropdown UI in a conditional on this prop. Move the country-related state/effects inside the conditional so they don't run when not needed.

2. **`src/pages/app/ExplorePage.tsx`** — Pass `showCountrySelector` to the `<WhatsHappening />` instance on the explore page.

3. **`src/components/app/RightSidebar.tsx`** — No changes needed (default `false` hides it).

## Scope
- Single file edit to `WhatsHappening.tsx` (add prop, conditional render)
- Single line change in `ExplorePage.tsx` (`<WhatsHappening showCountrySelector />`)

