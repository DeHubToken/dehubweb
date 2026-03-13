

# Add Country Dropdown to Topics/Tickers Bento

## Overview
Add a small country selector dropdown in the top-right corner of the "Talk of the Town" bento header. Defaults to "Global". Selecting any other country shows a "Coming Soon" toast. The data remains global for now.

## Changes

### 1. `src/components/app/WhatsHappening.tsx`
- Import `ChevronDown` from lucide and `Globe` icon
- Add state: `selectedCountry` defaulting to `'Global'` and `showDropdown` boolean
- Restructure the header row: title left-aligned or centered, country pill button top-right
- Country pill button shows a globe icon + country name + chevron, styled to match the bento (zinc-800/50 bg, small rounded pill)
- Dropdown: absolutely positioned list of countries (reuse a short curated list like US, UK, Japan, Germany, India, Brazil, etc. — not the full 200 list), with "Global" at top
- On selecting any country other than Global: show a sonner toast "Coming Soon" and keep selection as Global
- Click-outside closes dropdown

### 2. Country list (inline constant)
Short curated list (~15 popular countries + Global) to keep it clean. No need for the full 200-country list from ExplorePage.

### 3. Translations
Add `sidebar.global`, `sidebar.comingSoon` keys to `en.json` and the 17 major locale files.

## Technical Details
- Dropdown uses absolute positioning within the existing bento container
- Uses `useRef` + click-outside pattern already common in the codebase
- Toast via `sonner` (already installed)
- No backend changes needed

