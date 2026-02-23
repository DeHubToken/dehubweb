

## Problem

Both `en.json` and `es.json` have **duplicate `"settings"` JSON keys**. The first `"settings"` object (lines ~41-400) contains all the actual settings translations (title, manageAccount, logOut, profileSettings, etc.). But a second `"settings"` object was added at the bottom (lines ~847-849 in en.json, ~698-700 in es.json) containing only `loginDescription`. 

In JSON, duplicate keys cause the **last one to win**, so the entire settings translation block gets overwritten with just `{loginDescription}`. That's why the UI shows raw keys like `settings.title` and `settings.manageAccount`.

## Fix

1. **en.json**: Delete the duplicate `"settings"` block at line 847-849 and merge `"loginDescription"` into the existing `"settings"` block (around line 41).

2. **es.json**: Delete the duplicate `"settings"` block at line 698-700 and merge `"loginDescription"` into the existing `"settings"` block (around line 41).

3. **Audit all other locale files** (fr, de, pt, zh, ja, ko, ru, ar, hi, tr, id, it, nl, tl, ms, bn, fa, vi, th, pl, ro, uk) for the same duplicate-key issue and fix any that have it.

## Technical Details

- Remove lines 847-849 from `en.json` (the second `"settings": { "loginDescription": "..." }`)
- Add `"loginDescription": "Log in to access and manage your account settings."` inside the existing `"settings"` block in `en.json`
- Same pattern for `es.json`: remove lines 698-700, add `"loginDescription"` to existing settings block
- Check and fix all other locale files for the same duplicate key problem
