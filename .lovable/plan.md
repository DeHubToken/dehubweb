

## Expand TLD Whitelist Safely

### Why Not All 1,593 TLDs?
IANA lists ~1,593 TLDs, but many are brand names like `.xbox`, `.toyota`, `.jaguar`, `.windows`, `.amazon`. Including all of them would cause false positives -- e.g. "season.finale" or "game.over" would match as links because `.over` could theoretically be a TLD. The whitelist exists specifically to prevent this.

### What We Already Have
- `www.` prefix links already work with ANY TLD (from the last change)
- `https://` prefixed links also work with any TLD
- The whitelist only restricts bare domain detection (e.g. `sec.digital` without www/https)

### The Plan
Expand `COMMON_TLDS` with all **country-code TLDs** (2-letter, ~250) plus the most commonly used **generic TLDs** (~150 more), bringing the total to roughly 300+. This covers virtually every real-world link users would type in a bio while still excluding brand/novelty TLDs that could cause false positives.

### Technical Details

**File: `src/components/app/TranslatableText.tsx`** (line 25)

Replace the `COMMON_TLDS` constant with a much larger list organized by category:

1. **All 2-letter country codes** (ac, ad, ae, af, ... zw) -- these are safe since 2-letter words followed by a dot-separated domain are almost always URLs
2. **Popular generic TLDs** (com, org, net, app, dev, xyz, club, online, store, tech, digital, crypto, nft, dao, etc.) -- ~150 of the most commonly used ones
3. **Exclude brand TLDs** like .xbox, .toyota, .jaguar, .windows, .amazon to avoid false positives

This is a single-line change to the `COMMON_TLDS` constant. No logic changes needed.

