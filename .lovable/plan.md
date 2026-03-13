

# Locale Analysis: What's Left to Align with Spanish Baseline

## Summary Table

| Language | File | Lines | loginDescription | assistant errors | creators placeholders | toasts (English remaining) | commandCentre English | Overall Status |
|----------|------|-------|-----------------|-----------------|----------------------|---------------------------|----------------------|----------------|
| **French (fr)** | fr.json | 1271 | Translated | Translated | 4 English keys | Fully translated | 4 English keys | ~95% done |
| **Italian (it)** | it.json | 1260 | ENGLISH | Translated | Translated | ~40 English keys | Translated | ~85% done |
| **Korean (ko)** | ko.json | 1264 | ENGLISH | 12 English keys | Translated | ~40 English keys | Translated | ~80% done |
| **Russian (ru)** | ru.json | 1264 | ENGLISH | 12 English keys | Translated | ~40 English keys | Translated | ~80% done |
| **Portuguese (pt)** | pt.json | 1264 | ENGLISH | Translated | 4 English keys | ~40 English keys | Translated | ~85% done |
| **Chinese (zh)** | zh.json | 1264 | ENGLISH | Translated | 4 English keys | ~40 English keys | Translated | ~85% done |
| **Polish (pl)** | pl.json | 1313 | English | English | English | ~90% English toasts | English settings/feed/explore | ~30% done |
| **Dutch (nl)** | nl.json | 1680 | Missing | Bloated common section | Missing most sections | Missing toasts entirely | Missing | ~20% done |
| **Hindi (hi)** | hi.json | 1258 | Translated | Translated | Translated | Translated | Translated | ~99% done |

## Detailed Gaps Per Language

### Tier 1 -- Nearly Done (1-2 sections to fix)

**French (fr)** -- 4 English keys in `creators` (followerReachPlaceholder, emailOrTelegram, compensationPlaceholder, submitApplication, fillRequired) and 4 English keys in `commandCentre` (purchaseWithCard, copyWalletAddress, sendToWalletOrUsername, withdrawToBank).

**Hindi (hi)** -- Essentially complete. May have a few edge-case toasts missing but is the closest to the Spanish baseline.

### Tier 2 -- Moderate Gaps (toasts + assistant + loginDescription)

**Italian (it)** -- `settings.loginDescription` still English. ~40 toast keys still English (from `deposit_address_copied` through `transaction_failed`). Assistant error keys are translated.

**Portuguese (pt)** -- `settings.loginDescription` still English. 4 English keys in `creators`. ~40 toast keys still English. Assistant section is translated.

**Chinese (zh)** -- `settings.loginDescription` still English. 4 English keys in `creators`. ~40 toast keys still English. Assistant section is translated.

**Korean (ko)** -- `settings.loginDescription` still English. 12 `assistant` error keys still English (errorRateLimit through videoGenFailedDetail). ~40 toast keys still English.

**Russian (ru)** -- `settings.loginDescription` still English. 12 `assistant` error keys still English. ~40 toast keys still English.

### Tier 3 -- Major Work Needed

**Polish (pl)** -- Has a good `toasts` section partially translated (~30 keys done, ~100 still English). `settings`, `feed`, `explore`, `filters`, `drawers`, `assistant`, `commandCentre` sections are almost entirely in English. Needs a full rewrite.

**Dutch (nl)** -- Has a massively bloated `common` section (~400 keys with duplicated status* variants). Missing `toasts` section entirely. Missing `assistant`, `commandCentre`, `creators`, `careers` sections. Has `feed` and `explore` still in English. Structure doesn't match the Spanish baseline at all. Needs a complete rebuild.

## Recommended Implementation Order

1. **French** -- Fix 8 keys (smallest effort, big language)
2. **Italian** -- Translate loginDescription + ~40 toast keys
3. **Portuguese** -- Translate loginDescription + 4 creator keys + ~40 toast keys
4. **Chinese** -- Translate loginDescription + 4 creator keys + ~40 toast keys
5. **Korean** -- Translate loginDescription + 12 assistant keys + ~40 toast keys
6. **Russian** -- Translate loginDescription + 12 assistant keys + ~40 toast keys
7. **Polish** -- Full alignment (~500 keys to translate)
8. **Dutch** -- Complete rebuild (~800+ keys, remove bloat)

## Implementation Approach

For each file, copy the exact key structure from the Spanish baseline and translate every remaining English value. No hallucination -- use established translation patterns already present in each file. Each language will be done in its own edit pass.

