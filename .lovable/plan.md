

## Plan: Add Swiss German (`gsw`) Language Support

Swiss German (Schweizerdeutsch) will be added as a fully supported language, following the same pattern used for Croatian and all other languages.

### What is Swiss German?
Swiss German (`gsw` — ISO 639-3 code) is a collection of Alemannic dialects spoken in Switzerland. It differs significantly from Standard German (`de`) in vocabulary, grammar, and spelling. We'll use `gsw` as the language code to distinguish it from Standard German.

### Changes

**1. New file: `src/i18n/locales/gsw.json`**
- Full translation file covering all ~900 keys (nav, feed, explore, settings, wallet, command centre, notifications, assistant, bookmarks, leaderboard, careers, hero, drawers, etc.)
- Translations in Swiss German dialect (e.g., "Hei" instead of "Startseite", "Nochrichtä" instead of "Nachrichten", "Istelligä" instead of "Einstellungen")

**2. `src/i18n/index.ts`**
- Add `{ code: 'gsw', name: 'Swiss German', nativeName: 'Schwyzerdütsch' }` to `SUPPORTED_LANGUAGES` (alphabetically sorted)
- Add lazy loader: `gsw: () => import('./locales/gsw.json')`

**3. `src/hooks/use-user-language.ts`**
- Add `gsw: 'Swiss German'` to the `LANGUAGE_NAMES` mapping

### Technical Details
- Language code: `gsw` (ISO 639-3 for Alemannic/Swiss German)
- Lazy-loaded on demand, not bundled at startup
- Falls back to English if loading fails
- Will appear in the language selection drawer, sorted alphabetically

