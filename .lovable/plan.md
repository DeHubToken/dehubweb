

# Fix: Sidebar Topics/Tickers Toggle Not Translating

## Root Cause

The toggle bar uses `t('sidebar.posts')` and `t('sidebar.tickers')`, but **most locale files are missing these keys**. Only a handful of languages (en, es, ja, ko, ar, de, etc.) have the full sidebar section with `posts`, `tickers`, `noTickersYet`, `noCategoriesYet`, `searches`, `global`, and `comingSoon`. The rest only have the original keys (`talkOfTheTown`, `nothingTrending`, `post`, `logOut`, `logIn`).

When a key is missing, i18next falls back to the key name — so users see raw English "posts" / "tickers" instead of translated text.

## Fix

Add the missing 7 sidebar keys (`posts`, `tickers`, `noTickersYet`, `noCategoriesYet`, `searches`, `global`, `comingSoon`) to all ~100 locale files that are missing them, with proper translations for each language.

## Scope

- Update approximately 100 locale JSON files in `src/i18n/locales/`
- No component or logic changes needed — the code already references the correct keys

