## Goal
Make every infinite-scroll "Loading more..." / "Load more" string go through the i18n system so it translates into all 110 languages — same as the rest of the UI.

## 1. Add shared keys to `common` namespace (all 110 locales in `src/i18n/locales/*.json`)

Add two new keys under the existing `common` namespace:

```json
"common": {
  ...,
  "loadingMore": "Loading more...",
  "loadMore": "Load more"
}
```

For each locale, prefer reusing an existing translation already present in that file (e.g. `notifications.loadMore`, `explorePage.loadingMore`) so we don't ship English text in non-English files. Fallback to the English value when no existing translation exists. This will be done with a small Node script run once during the edit pass — no runtime code.

## 2. Replace hardcoded strings in components

Swap the literal strings for `t('common.loadingMore')` / `t('common.loadMore')` (add `useTranslation` import where missing). Files:

- `src/components/app/feeds/VideosFeed.tsx` (line 823)
- `src/components/app/feeds/ImagesFeed.tsx` (lines 196, 284)
- `src/components/app/feeds/HomeFeed.tsx` (line 1482)
- `src/components/app/feeds/ShortsFeed.tsx` (line 659)
- `src/components/app/feeds/RelatedPostsFeed.tsx` (if any visible text)
- `src/components/app/feeds/RelatedImagesFeed.tsx` (spinner only — no change)
- `src/components/app/feeds/RelatedVideosFeed.tsx` (spinner only — no change)
- `src/components/app/profile/ProfileTabContent.tsx` (line 422 "Load more")
- `src/features/post/components/SoundPicker.tsx` (line 229 "Load more")
- `src/pages/app/BuyCoinsPage.tsx` (line 688 "Load more...")

Existing already-translated usages (`explorePage.loadingMore`, `notifications.loadMore`) are left as-is — they're already in i18n.

## Out of scope
- No changes to fetch logic, pagination behavior, or component structure.
- No new languages added; only new keys in existing locale files.
- Backend / API untouched.

## Technical notes
- Script approach for locale injection: read each `*.json`, if `common` exists insert `loadingMore`/`loadMore` (preferring values from `notifications.loadMore`, `explorePage.loadingMore`, or `explorePage.loadMore` already in that file; else English fallback). Write back with stable formatting (2-space indent matching current files).
- No new i18n namespace; reuses `common` so any future component can call `t('common.loadingMore')` directly.
