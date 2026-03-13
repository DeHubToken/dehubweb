

# Dutch (nl.json) Complete Rebuild

## Problem
The Dutch locale file is only ~20% translated. The `nav`, `common`, `glossary`, and `profileOptions` sections are in Dutch, but **everything else** (settings, feed, explore, filters, drawers, assistant, commandCentre, wallet, bookmarks, notifications, toasts, careers, governance, and 15+ more sections) is still in English. The `common` section also has ~170 bloated duplicate `status*` keys that don't exist in the Spanish baseline.

This was identified as "Tier 3 — Major Work Needed" in the previous analysis but wasn't implemented yet (only Tier 1 and Tier 2 were done).

## Plan

**Single task**: Rewrite `nl.json` to fully align with the Spanish baseline structure.

1. **Remove bloat**: Delete all `status*` duplicate keys from `common` (lines 232-402) — these are redundant copies of keys that already exist without the `status` prefix.

2. **Translate all English sections** (~800 keys across 25+ sections):
   - `feed`, `explore`, `settings` (full ~190-key section)
   - `toasts` (~60 remaining English keys from line 508 onward)
   - `postOptions`, `filters`, `drawers`
   - `assistant`, `publicChat`, `aiChat`
   - `commandCentre`, `wallet`
   - `features`, `bookmarks`, `notifications`, `messages`, `music`
   - `leaderboard`, `explorePage`, `notFound`, `profile`
   - `buyCoins`, `agents`, `hero`, `creators`
   - `loginModal`, `careers`, `governance`
   - `sidebar`, `postInfo`

3. **Use informal "je/jij" form** consistently (standard for Dutch apps), matching the existing `profileOptions` style.

4. **Preserve** already-translated sections (`nav`, `common` non-status keys, `glossary`, `profileOptions`, first ~30 toast keys).

This will bring Dutch from ~20% to 100% alignment with the Spanish baseline, matching the quality of Danish and all other completed locales.

