

# Fix PPV Drawer Translation Keys

## Problem
The PPV drawer buttons use translation keys `drawers.paying` and `drawers.payAmount` that don't exist in any of the 23 locale files. The `drawers` section itself only exists in `en.json` and `es.json` -- the other 21 locale files are missing it entirely.

Because `react-i18next` falls back to the hardcoded English default strings, the buttons always show English text regardless of the user's language.

## Solution
Add the missing `paying` and `payAmount` keys to `en.json` and `es.json`, then add the full `drawers` section (with all existing keys plus the two new ones) to the remaining 21 locale files with properly translated strings.

## Changes

### 1. Add missing keys to `en.json`
Add to the `drawers` section:
- `"paying": "Paying..."`
- `"payAmount": "Pay {{amount}} {{currency}}"`

### 2. Add missing keys to `es.json`
Add to the `drawers` section:
- `"paying": "Pagando..."`
- `"payAmount": "Pagar {{amount}} {{currency}}"`

### 3. Add `drawers` section to remaining 21 locale files
Each of the following files needs the full `drawers` block with all keys translated into their respective language:

`ar.json`, `bn.json`, `de.json`, `fr.json`, `hi.json`, `id.json`, `it.json`, `ja.json`, `ko.json`, `ms.json`, `nl.json`, `pl.json`, `pt.json`, `ro.json`, `ru.json`, `th.json`, `tl.json`, `tr.json`, `uk.json`, `vi.json`, `zh.json`

Each file will include translated versions of all drawer keys: `ppvTitle`, `unlockPrice`, `ppvDescription`, `unlockFor`, `bountyTitle`, `firstViews`, `rewardedWatching`, `firstComments`, `rewardedEngaging`, `rewardPerUser`, `totalBountyPool`, `bountyDescription`, `gatedTitle`, `mustHoldToView`, `gatedDescription`, `setPpvPrice`, `currency`, `price`, `ppvDhbInfo`, `ppvUsdInfo`, `setupBounty`, `viewersToReward`, `numberOfViewers`, `commentersToReward`, `numberOfCommenters`, `rewardPerPerson`, `amountPerPerson`, `totalLocked`, `tokenGateSettings`, `requiresDhb`, `minimumDhb`, `minimumAmount`, `cancel`, `confirm`, **`paying`**, and **`payAmount`**.

No code changes needed -- the component already references the correct keys with proper fallbacks.
